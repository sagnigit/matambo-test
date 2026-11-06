"""Génère core/parcours.json à partir de ../Matambo_liens_de_test.html (sections et chemins de test du site).
Usage : python outils/extraire_parcours.py"""
import json, re, html, pathlib, sys

ici = pathlib.Path(__file__).resolve().parent.parent
source = ici.parent / "Matambo_liens_de_test.html"
t = source.read_text(encoding="utf-8", errors="replace")
corps = t[t.find("<main>"):]
sections = []
for bloc in re.split(r"(?=<h2>)", corps):
    m = re.match(r"<h2>(.*?)</h2>", bloc, re.S)
    if not m:
        continue
    titre = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
    notes = [html.unescape(re.sub(r"<[^>]+>", "", n)).strip() for n in re.findall(r"<div class='note'>(.*?)</div>", bloc, re.S)]
    liens = []
    for href, libelle in re.findall(r"<a href='([^']+)'[^>]*>(.*?)</a>", bloc, re.S):
        chemin = re.sub(r"^https?://[^/]+", "", html.unescape(href)) or "/"
        liens.append({"libelle": html.unescape(re.sub(r"<[^>]+>", "", libelle)).strip(), "chemin": chemin})
    # « Outils à part » (faux agrégateur sur le port 9000, admin Django) ne passe pas par le tunnel : on l'écarte.
    if titre.lower().startswith("outils"):
        continue
    if liens:
        sections.append({"titre": titre, "note": " ".join(notes), "liens": liens})
sortie = ici / "core" / "parcours.json"
sortie.write_text(json.dumps({"sections": sections}, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(sections)} sections, {sum(len(s['liens']) for s in sections)} liens -> {sortie}")
