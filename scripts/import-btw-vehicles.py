#!/usr/bin/env python3
"""One-off import of rental vehicles from btw.sk (Phase 0).

Source: WordPress GraphQL API used by https://www.btw.sk/nase-vozidla
        (https://wp.btw.sk/graphql, post type `vozidla`, `typ = Prenajom`).

Output: supabase/seed/vehicles.json
        supabase/seed/images/<slug>/{main,1,2,3}.webp  (main = exterior, 1-3 = interior)

This is NOT a sync. After the first seed, vehicles are managed only in the admin.
Usage:  python3 scripts/import-btw-vehicles.py
Needs:  Pillow
"""
from __future__ import annotations

import html
import io
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

from PIL import Image

GRAPHQL_URL = "https://wp.btw.sk/graphql"
ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "supabase" / "seed"
IMG_DIR = SEED_DIR / "images"
MAX_WIDTH = 1920
WEBP_QUALITY = 82

QUERY = """
{ vozidla(first: 100) { nodes { title slug popisVozidla {
  nazov kategoria cena osoby batozina prevodovka palivo typ popis motorizacia
  komfort technologie sluzbyVCene
  nahlad { node { sourceUrl } }
  lightbox1 { node { sourceUrl } }
  lightbox2 { node { sourceUrl } }
  lightbox3 { node { sourceUrl } }
} } } }
"""

# Manual mapping: source slug -> (category slug, brand, model, variant).
# The source only knows "First Class / Business Class / Business Van";
# the new catalogue uses Sedan / SUV / Limousine / Van.
MAPPING: dict[str, tuple[str, str, str, str]] = {
    "mercedes-benz-e200d": ("sedan", "Mercedes-Benz", "E 200 d", ""),
    "mercedes-benz-e220d": ("sedan", "Mercedes-Benz", "E 220 d", ""),
    "mercedes-benz-s400d": ("limousine", "Mercedes-Benz", "S 400 d", "4MATIC"),
    "mercedes-benz-gls400d": ("suv", "Mercedes-Benz", "GLS 400 d", "4MATIC"),
    "mercedes-benz-v250d-4matic-extra-long": ("van", "Mercedes-Benz", "V 250 d", "4MATIC Extra-Long"),
    "mercedes-benz-v300d-4matic-long": ("van", "Mercedes-Benz", "V 300 d", "4MATIC Long"),
    "hyundai-staria-luxury-4x4": ("van", "Hyundai", "Staria", "Luxury 4x4"),
}

FUEL = {"diesel": "diesel", "benzin": "petrol", "elektro": "electric", "hybrid": "hybrid"}
TRANSMISSION = {"automat": "automatic", "manual": "manual"}
SAFETY_RE = re.compile(r"kamer|parkovac|senzor", re.IGNORECASE)


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def fetch(url: str, data: bytes | None = None) -> bytes:
    headers = {"User-Agent": "btw-rental-seed-import/1.0"}
    if data:
        headers["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=120) as r:
        return r.read()


def html_to_list(value: str | None) -> list[str]:
    if not value:
        return []
    text = html.unescape(re.sub(r"<br\s*/?>", "\n", value))
    text = re.sub(r"<[^>]+>", "", text)
    items = [re.sub(r"^[–\-•]\s*", "", line.strip()) for line in text.splitlines()]
    return [i[0].upper() + i[1:] for i in items if i]


def html_to_text(value: str | None) -> str | None:
    items = html_to_list(value)
    return " ".join(items) if items else None


def parse_engine(text: str | None) -> dict:
    out = {"engine": None, "power_kw": None, "power_hp": None, "gears": None, "drivetrain": None}
    if not text:
        return out
    parts = [p.strip() for p in text.split(",")]
    out["engine"] = parts[0]
    if m := re.search(r"(\d+)\s*kw", text, re.IGNORECASE):
        out["power_kw"] = int(m.group(1))
    if m := re.search(r"(\d+)\s*HP", text):
        out["power_hp"] = int(m.group(1))
    if m := re.search(r"\((\d+)\s*st", text):
        out["gears"] = int(m.group(1))
    if re.search(r"4\s*[×x]\s*4", text):
        out["drivetrain"] = "awd"
    elif "zadný" in text:
        out["drivetrain"] = "rwd"
    elif "predný" in text:
        out["drivetrain"] = "fwd"
    return out


def save_image(url: str, target: Path) -> dict:
    img = Image.open(io.BytesIO(fetch(url)))
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    img.save(target, "WEBP", quality=WEBP_QUALITY, method=6)
    return {
        "file": str(target.relative_to(SEED_DIR)),
        "source_url": url,
        "width": img.width,
        "height": img.height,
    }


def main() -> None:
    payload = json.loads(fetch(GRAPHQL_URL, json.dumps({"query": QUERY}).encode()))
    if payload.get("errors"):
        raise SystemExit(payload["errors"])
    nodes = payload["data"]["vozidla"]["nodes"]

    vehicles, skipped = [], []
    rental = [n for n in nodes if n["popisVozidla"]["typ"] == ["Prenajom"]]
    for n in nodes:
        if n not in rental:
            skipped.append({"title": n["title"], "slug": n["slug"], "typ": n["popisVozidla"]["typ"]})

    rental.sort(key=lambda n: list(MAPPING).index(n["slug"]))
    for index, node in enumerate(rental, start=1):
        p = node["popisVozidla"]
        category, brand, model, variant = MAPPING[node["slug"]]
        name = " ".join(x for x in (brand, model, variant) if x)
        slug = slugify(name)
        engine_text = html_to_text(p["motorizacia"])
        tech_all = html_to_list(p["technologie"])

        images = []
        # `nahlad` is the exterior cut-out used as the card image on btw.sk -> main photo.
        # `lightbox1-3` are interior shots -> gallery.
        for key, filename, is_main in (
            ("nahlad", "main.webp", True),
            ("lightbox1", "1.webp", False),
            ("lightbox2", "2.webp", False),
            ("lightbox3", "3.webp", False),
        ):
            meta = save_image(p[key]["node"]["sourceUrl"], IMG_DIR / slug / filename)
            meta.update({"is_main": is_main, "sort_order": len(images), "role": "exterior" if key == "nahlad" else "interior"})
            images.append(meta)
            print("saved", meta["file"])

        vehicles.append(
            {
                "source": {
                    "slug": node["slug"],
                    "title": node["title"],
                    "category": p["kategoria"],
                    "price_from_eur": p["cena"],
                },
                "name": name,
                "slug": slug,
                "brand": brand,
                "model": model,
                "variant": variant or None,
                "category": category,
                # Not published on btw.sk -> dummy test values, to be replaced in the admin.
                "vin": f"TESTBTW{index:010d}",
                "vin_is_placeholder": True,
                "license_plate": f"BT{index:03d}TW",
                "license_plate_is_placeholder": True,
                "engine_text": engine_text,
                **parse_engine(engine_text),
                "fuel": FUEL[p["palivo"][0]],
                "transmission": TRANSMISSION[p["prevodovka"][0]],
                "seats": p["osoby"],
                "luggage": p["batozina"],
                "description": {"sk": p["popis"], "en": None},
                "features": {
                    "comfort": html_to_list(p["komfort"]),
                    "technical": [i for i in tech_all if not SAFETY_RE.search(i)],
                    "safety": [i for i in tech_all if SAFETY_RE.search(i)],
                    "included": html_to_list(p["sluzbyVCene"]),
                },
                "for_rental": True,
                "for_transfer": False,
                "is_active": True,
                "sort_order": index * 10,
                "price_per_day_cents": 7900,
                "images": images,
            }
        )

    out = {
        "_meta": {
            "source_page": "https://www.btw.sk/nase-vozidla",
            "source_api": GRAPHQL_URL,
            "note": "One-off import. VINs and licence plates are dummy test values, prices are the 79 EUR/day placeholder from the brief.",
            "skipped_non_rental": skipped,
        },
        "vehicles": vehicles,
    }
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    (SEED_DIR / "vehicles.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(vehicles)} vehicles -> supabase/seed/vehicles.json")


if __name__ == "__main__":
    main()
