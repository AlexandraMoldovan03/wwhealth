"""Create marked, passwordless doctor identities in a dedicated Supabase demo project."""
import argparse
import getpass
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_ENV = Path(__file__).resolve().parents[2] / "backend" / ".env"


def _env_file_value(name: str) -> str:
    """Reads one value from backend/.env (never printed)."""
    if not BACKEND_ENV.exists():
        return ""
    for line in BACKEND_ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].split(" #")[0].strip().strip('"').strip("'")
    return ""

BATCH = "wwhealth-smartcare-v1"
ROSTER = {
    "family_medicine": ["Ana Rădulescu", "Mihai Dobre", "Elena Pavel", "Radu Bălan"],
    "cardiology": ["Irina Mureșan", "Vlad Marinescu", "Ioana Stanciu"],
    "neurology": ["Daria Stoica", "Andrei Neagu", "Silvia Iancu"],
    "orthopedics": ["Matei Preda", "Cristina Olaru", "Tudor Cristea"],
    "dermatology": ["Oana Florescu", "Alina Cernat", "Sorin Vîlcu"],
    "ent": ["Nora Dumitrescu", "Cezar Nistor"],
    "ophthalmology": ["Mara Florea", "Alex Călinescu"],
    "gastroenterology": ["Ada Vasile", "Victor Barbu"],
    "endocrinology": ["Diana Petrescu", "Dan Cazacu", "Iulia Sava", "Paul Voicu"],
    "gynecology": ["Ilinca Dinu", "Carmen Sârbu"],
    "urology": ["Emil Rusu", "Bogdan Lupu"],
    "pulmonology": ["Roxana Olteanu", "Rareș Zaharia"],
    "pediatrics": ["Sonia Iliescu", "Cătălin Nica"],
    "psychiatry": ["Laura Mocanu", "Cosmin Bucur"],
    "rheumatology": ["Teodora Ilie", "Marcel Filimon"],
    "allergology": ["Amalia Enache", "George Coman"],
}
CITIES = ("Timișoara", "Cluj-Napoca", "București", "Alba Iulia")


def roster():
    ordinal = 0
    for specialty, names in ROSTER.items():
        for index, name in enumerate(names):
            ordinal += 1
            focus = "diabet și nutriție" if specialty == "endocrinology" and index >= 2 else "evaluare și monitorizare"
            yield {
                "email": f"wwhealth-smartcare-demo-{ordinal:02d}@example.invalid",
                "app_metadata": {
                    "smartcare_demo_batch": BATCH,
                    "smartcare_demo_ordinal": ordinal,
                    "smartcare_demo_specialty": specialty,
                    "smartcare_demo_minutes": 45 if ordinal % 4 == 0 else 30,
                },
                "user_metadata": {
                    "full_name": f"[DEMO] {name}",
                    "bio": f"Profil fictiv pentru demonstrație. Consultații de {focus}.",
                    "experience_years": 4 + ordinal % 17,
                    "city": CITIES[(ordinal - 1) % len(CITIES)],
                    "consultation_type": "online" if ordinal % 5 == 0 else "in_person",
                },
            }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo-project-ref", required=True, help="Reference of the dedicated demo project")
    args = parser.parse_args()
    url = (os.environ.get("SUPABASE_URL") or _env_file_value("SUPABASE_URL")).rstrip("/")
    if url != f"https://{args.demo_project_ref}.supabase.co":
        parser.error("SUPABASE_URL (environment or backend/.env) does not match --demo-project-ref.")
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
           or _env_file_value("SUPABASE_SECRET_KEY"))
    if not key:
        # Hidden input: the key is used only for this run, never saved or printed.
        key = getpass.getpass("Secret key (sb_secret_… or service_role) for this project, hidden: ").strip()
    if not key:
        parser.error("No server key given.")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):  # legacy service_role JWT also goes in Authorization; new sb_secret keys only in apikey
        headers["Authorization"] = f"Bearer {key}"

    def request(path, body=None):
        req = urllib.request.Request(
            f"{url}/auth/v1/admin/users{path}",
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"Supabase Admin API returned HTTP {exc.code}. Fix the issue and rerun.") from None

    desired = {item["email"]: item for item in roster()}
    existing = {}
    page = 1
    while True:
        users = request(f"?page={page}&per_page=100")["users"]
        existing.update((u["email"].lower(), u) for u in users if (u.get("email") or "").lower() in desired)
        if len(users) < 100:
            break
        page += 1

    for email, user in existing.items():
        expected = desired[email]["app_metadata"]
        if any((user.get("app_metadata") or {}).get(k) != v for k, v in expected.items()):
            raise SystemExit(f"Account collision at {email}. No existing account was modified.")

    for email, item in desired.items():
        if email not in existing:
            request("", item)

    print(f"{len(desired)} demo Auth identities ready ({len(existing)} already existed).")


if __name__ == "__main__":
    main()
