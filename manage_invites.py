#!/usr/bin/env python3
"""
manage_invites.py — CLI for managing Quorum beta invite codes.

Usage:
    python manage_invites.py generate <count> [--max-uses N]
    python manage_invites.py list
    python manage_invites.py show <code>

Examples:
    python manage_invites.py generate 20
    python manage_invites.py generate 5 --max-uses 3
    python manage_invites.py list
"""

import argparse
import secrets
import sys
import database as db


def _generate_codes(count: int) -> list[str]:
    """Generate N unique invite codes in XXXX-XXXX format."""
    return [
        f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"
        for _ in range(count)
    ]


def cmd_generate(count: int, max_uses: int):
    db.init_db()
    codes = _generate_codes(count)
    db.create_invite_codes(codes, max_uses=max_uses)
    print(f"\nGenerated {len(codes)} invite code(s) (max_uses={max_uses}):\n")
    for code in codes:
        print(f"  {code}")
    print()


def cmd_list():
    db.init_db()
    codes = db.list_invite_codes()
    if not codes:
        print("\nNo invite codes found.\n")
        return

    print(f"\n{'CODE':<20} {'MAX':>5} {'USED':>5} {'ACTIVE':>7} {'CREATED'}")
    print("-" * 60)
    for c in codes:
        active = "yes" if c["used_count"] < c["max_uses"] else "no"
        print(f"  {c['code']:<18} {c['max_uses']:>5} {c['used_count']:>5} {active:>7}  {c['created_at'][:10]}")
    print()


def cmd_show(code: str):
    db.init_db()
    with db.get_db() as conn:
        row = conn.execute(
            "SELECT * FROM invite_codes WHERE code = ?", (code.upper(),)
        ).fetchone()
    if not row:
        print(f"\nCode '{code}' not found.\n")
        sys.exit(1)
    print(f"\nCode:      {row['code']}")
    print(f"Max uses:  {row['max_uses']}")
    print(f"Used:      {row['used_count']}")
    print(f"Active:    {'yes' if row['used_count'] < row['max_uses'] else 'no'}")
    print(f"Created:   {row['created_at']}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Manage Quorum invite codes")
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("generate", help="Generate new invite codes")
    gen.add_argument("count", type=int, help="Number of codes to generate")
    gen.add_argument("--max-uses", type=int, default=1, dest="max_uses",
                     help="Max times each code can be used (default: 1)")

    sub.add_parser("list", help="List all invite codes")

    show = sub.add_parser("show", help="Show details for a specific code")
    show.add_argument("code", type=str)

    args = parser.parse_args()

    if args.command == "generate":
        cmd_generate(args.count, args.max_uses)
    elif args.command == "list":
        cmd_list()
    elif args.command == "show":
        cmd_show(args.code)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
