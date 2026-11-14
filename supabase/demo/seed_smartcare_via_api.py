"""
Smart Care demo doctors over the Supabase APIs (same result as seed_smartcare_doctors.sql, no SQL Editor needed).

1. creates / reuses the 40 marked, passwordless demo identities (create_smartcare_demo_auth.py, Admin API);
2. profiles: full_name "[DEMO] …", role doctor; doctor_specialties: one catalog specialty each;
3. doctor_availability: next 30 days, Europe/Bucharest wall-clock shifts (08–14, 14–20 or 09–17), Mon–Fri plus some
   Saturdays, with a break and a few blocked slots; never in the past; existing slots are kept (no duplicates).
Idempotent. Deletes nothing, touches only the 40 demo accounts. URL + SUPABASE_SECRET_KEY from backend/.env (never
printed). Run with:  backend/.venv/bin/python supabase/demo/seed_smartcare_via_api.py --demo-project-ref <ref>
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import create_smartcare_demo_auth as accounts  # noqa: E402

TZ = ZoneInfo("Europe/Bucharest")
BATCH = accounts.BATCH


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo-project-ref", required=True)
    args = parser.parse_args()
    url = accounts._env_file_value("SUPABASE_URL").rstrip("/")
    key = accounts._env_file_value("SUPABASE_SECRET_KEY")
    if url != f"https://{args.demo_project_ref}.supabase.co":
        parser.error("SUPABASE_URL in backend/.env does not match --demo-project-ref.")
    if not key:
        parser.error("SUPABASE_SECRET_KEY is empty in backend/.env.")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"

    def call(method, path, body=None, extra=None):
        req = urllib.request.Request(f"{url}{path}", method=method, headers={**headers, **(extra or {})},
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            raise SystemExit(f"{method} {path.split('?')[0]} → HTTP {exc.code}: {detail}") from None

    # 1. accounts (Admin API)
    desired = {item["email"]: item for item in accounts.roster()}
    found, page = {}, 1
    while True:
        users = call("GET", f"/auth/v1/admin/users?page={page}&per_page=100")["users"]
        found.update(((u.get("email") or "").lower(), u) for u in users if (u.get("email") or "").lower() in desired)
        if len(users) < 100:
            break
        page += 1
    for email, user in found.items():
        if (user.get("app_metadata") or {}).get("smartcare_demo_batch") != BATCH:
            raise SystemExit(f"Account collision at {email}; nothing was changed.")
    created = 0
    for email, item in desired.items():
        if email not in found:
            found[email] = call("POST", "/auth/v1/admin/users", {**item, "email_confirm": True})
            created += 1
    print(f"Accounts: {len(found)} demo identities ({created} created now).")

    roster = []
    for email, user in found.items():
        meta = desired[email]["app_metadata"]
        roster.append({"id": user["id"], "ordinal": meta["smartcare_demo_ordinal"], "specialty": meta["smartcare_demo_specialty"],
                       "minutes": meta["smartcare_demo_minutes"], "name": desired[email]["user_metadata"]["full_name"]})
    roster.sort(key=lambda r: r["ordinal"])

    # 2. catalog check (migration 20261117000100 must be applied)
    catalog = {row["id"]: row["name_ro"] for row in call("GET", "/rest/v1/medical_specialties?select=id,name_ro")}
    missing = {r["specialty"] for r in roster} - set(catalog)
    if missing:
        raise SystemExit(f"Specialties missing from medical_specialties: {sorted(missing)}")

    call("POST", "/rest/v1/profiles?on_conflict=id",
         [{"id": r["id"], "full_name": r["name"], "role": "doctor"} for r in roster],
         {"Prefer": "resolution=merge-duplicates,return=minimal"})
    call("POST", "/rest/v1/doctor_specialties?on_conflict=doctor_id,specialty_id",
         [{"doctor_id": r["id"], "specialty_id": r["specialty"]} for r in roster],
         {"Prefer": "resolution=ignore-duplicates,return=minimal"})
    print("Profiles and specialties: OK.")

    # 3. availability
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=30)
    taken: dict[str, list[tuple[datetime, datetime]]] = {}
    for r in roster:  # per doctor: one month is well under the API's 1000-row page
        for row in call("GET", f"/rest/v1/doctor_availability?select=starts_at,ends_at&doctor_id=eq.{r['id']}"
                               f"&starts_at=gt.{now.isoformat().replace('+00:00', 'Z')}&limit=1000"):
            taken.setdefault(r["id"], []).append((datetime.fromisoformat(row["starts_at"]), datetime.fromisoformat(row["ends_at"])))

    today = datetime.now(TZ).date()
    rows = []
    for r in roster:
        first, last = {0: (8, 14), 1: (14, 20), 2: (9, 17)}[r["ordinal"] % 3]
        step = timedelta(minutes=r["minutes"])
        for offset in range(31):
            day: date = today + timedelta(days=offset)
            weekday = day.isoweekday()
            if weekday == 7 or (weekday == 6 and r["ordinal"] % 6 != 0):
                continue
            local = datetime.combine(day, time(first), TZ)
            end_of_shift = datetime.combine(day, time(last), TZ)
            number = 0
            while local + step <= end_of_shift:
                number += 1
                start_utc, end_utc = local.astimezone(timezone.utc), (local + step).astimezone(timezone.utc)
                local += step
                if number in (4, 5):  # break
                    continue
                if (number + r["ordinal"] + day.timetuple().tm_yday) % 7 == 0:  # blocked slot
                    continue
                if start_utc <= now or end_utc > horizon:
                    continue
                if any(s < end_utc and start_utc < e for s, e in taken.get(r["id"], [])):
                    continue
                rows.append({"doctor_id": r["id"], "starts_at": start_utc.isoformat(), "ends_at": end_utc.isoformat()})
    for i in range(0, len(rows), 500):
        call("POST", "/rest/v1/doctor_availability?on_conflict=doctor_id,starts_at", rows[i:i + 500],
             {"Prefer": "resolution=ignore-duplicates,return=minimal"})
    print(f"Availability: {len(rows)} new slots (existing kept).")

    # 4. check (exact counts: a plain list would stop at the API's 1000-row limit)
    def count(path):
        req = urllib.request.Request(f"{url}{path}", headers={**headers, "Prefer": "count=exact", "Range": "0-0"})
        with urllib.request.urlopen(req, timeout=60) as res:
            return int(res.headers.get("Content-Range", "*/0").split("/")[1])

    z = lambda d: d.isoformat().replace("+00:00", "Z")  # noqa: E731
    per_doctor = {r["id"]: count(f"/rest/v1/doctor_availability?select=id&doctor_id=eq.{r['id']}"
                                 f"&starts_at=gt.{z(now)}&starts_at=lt.{z(now + timedelta(days=14))}") for r in roster}
    print("\nspecialty            doctors  with free slots (14 days)  slots")
    for spec in sorted({r["specialty"] for r in roster}):
        docs = [r for r in roster if r["specialty"] == spec]
        print(f"{spec:20} {len(docs):7}  {sum(1 for d in docs if per_doctor[d['id']]):26}  {sum(per_doctor[d['id']] for d in docs):5}")
    print(f"\nTotal: {len(roster)} demo doctors in {len({r['specialty'] for r in roster})} specialties.")


if __name__ == "__main__":
    main()
