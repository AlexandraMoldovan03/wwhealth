"""
Lets you sign in as ONE [DEMO] doctor to test accept / reject / propose. Touches only accounts of the demo batch.

  backend/.venv/bin/python supabase/demo/enable_demo_doctor_login.py --demo-project-ref <ref> --list
  backend/.venv/bin/python supabase/demo/enable_demo_doctor_login.py --demo-project-ref <ref> --doctor 5

The password is typed by you (hidden), sent only to Supabase Auth, never saved or printed. URL + SUPABASE_SECRET_KEY
come from backend/.env. Running it again for the same doctor just changes the password.
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import create_smartcare_demo_auth as accounts  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--demo-project-ref", required=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="show the 40 demo doctors with their numbers")
    group.add_argument("--doctor", type=int, help="number of the demo doctor (1-40)")
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

    def call(method, path, body=None):
        req = urllib.request.Request(f"{url}/auth/v1/admin/users{path}", method=method, headers=headers,
                                     data=json.dumps(body).encode() if body is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"Supabase Auth returned HTTP {exc.code}: {exc.read().decode(errors='replace')[:200]}") from None

    demo, page = {}, 1
    while True:
        users = call("GET", f"?page={page}&per_page=100")["users"]
        for u in users:
            meta = u.get("app_metadata") or {}
            if meta.get("smartcare_demo_batch") == accounts.BATCH:
                demo[meta["smartcare_demo_ordinal"]] = u
        if len(users) < 100:
            break
        page += 1
    if not demo:
        raise SystemExit("No demo doctors found. Run seed_smartcare_via_api.py first.")

    if args.list:
        for n in sorted(demo):
            u = demo[n]
            print(f"{n:2}  {(u.get('user_metadata') or {}).get('full_name', ''):32} "
                  f"{u['app_metadata']['smartcare_demo_specialty']:18} {u['email']}")
        return

    user = demo.get(args.doctor)
    if user is None:
        parser.error(f"Demo doctor {args.doctor} does not exist (1-{max(demo)}).")
    name = (user.get("user_metadata") or {}).get("full_name", "")
    password = getpass.getpass(f"New password for {name} (min. 6 characters, hidden): ")
    if len(password) < 6 or password != getpass.getpass("Repeat the password: "):
        raise SystemExit("Passwords are shorter than 6 characters or do not match. Nothing was changed.")
    call("PUT", f"/{user['id']}", {"password": password, "email_confirm": True})
    print(f"Done. In the app, sign in as the doctor with:\n  email: {user['email']}\n  password: the one you just typed")


if __name__ == "__main__":
    main()
