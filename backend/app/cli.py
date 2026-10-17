import argparse
import sys
from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.user import User
from app.core.security import get_password_hash
from app.services.pin_service import PinService
import app.models


def bootstrap_admin(email: str, password: str):
    """Secure bootstrap command to create the initial administrator."""
    db = SessionLocal()
    try:
        email_clean = email.strip().lower()
        existing = db.query(User).filter(User.email == email_clean).first()
        if existing:
            print(f"Error: User with email '{email_clean}' already exists.")
            sys.exit(1)

        hashed = get_password_hash(password)
        admin_user = User(
            email=email_clean,
            password_hash=hashed,
            role="admin",
            status="active",
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        print(f"Successfully created administrator: {admin_user.email} (ID: {admin_user.id})")
    finally:
        db.close()


def generate_pin_cli(length: int, label: str, max_scans: int):
    """CLI helper to generate a PIN."""
    db = SessionLocal()
    try:
        pin_model, plain = PinService.generate_single_pin(
            db=db,
            pin_length=length,
            label=label,
            max_completed_scans=max_scans if max_scans > 0 else None,
            created_by="CLI",
        )
        print(f"==================================================")
        print(f"ACCESS PIN CREATED")
        print(f"PIN:            {plain}")
        print(f"Length:         {length}")
        print(f"Label:          {label}")
        print(f"Max Scans:      {max_scans if max_scans > 0 else 'Unlimited'}")
        print(f"Status:         {pin_model.status}")
        print(f"==================================================")
        print("NOTE: Store this PIN now. The plaintext is not stored in the database.")
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="CardScan Administrative CLI Utility")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # create-admin
    admin_parser = subparsers.add_parser("create-admin", help="Bootstrap an administrator account")
    admin_parser.add_argument("--email", required=True, help="Administrator email address")
    admin_parser.add_argument("--password", required=True, help="Administrator password")

    # create-pin
    pin_parser = subparsers.add_parser("create-pin", help="Generate a customer access PIN")
    pin_parser.add_argument("--length", type=int, default=4, choices=[4, 5], help="PIN length (4 or 5 digits)")
    pin_parser.add_argument("--label", default="CLI Generated", help="Optional reference label")
    pin_parser.add_argument("--max-scans", type=int, default=1, help="Max completed scans (0 for unlimited)")

    # init-db
    subparsers.add_parser("init-db", help="Initialize database tables")

    args = parser.parse_args()

    if args.command == "create-admin":
        bootstrap_admin(args.email, args.password)
    elif args.command == "create-pin":
        generate_pin_cli(args.length, args.label, args.max_scans)
    elif args.command == "init-db":
        Base.metadata.create_all(bind=engine)
        print("Database schema successfully initialized.")


if __name__ == "__main__":
    main()
