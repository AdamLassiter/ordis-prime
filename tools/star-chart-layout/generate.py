#!/usr/bin/env python3
"""Build the reviewed Star Chart layout from Wiki screenshot annotations.

The sparse coordinate maps below contain only labels visible in the cited
screenshots. Active catalog locations absent from those images are deliberately
placed in a bottom-edge review queue instead of being assigned guessed geometry.
"""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATABASE = ROOT / "data" / "ordis-prime.sqlite"
OUTPUT = ROOT / "data" / "manual" / "star-chart-layout.json"
IMAGE_WIDTH = 1920
IMAGE_HEIGHT = 1080

SCREENSHOTS = {
    "Mercury": "StarChartMercuryU32.jpg", "Venus": "StarChartVenusU32.jpg",
    "Earth": "StarChartEarthU32.jpg", "Lua": "StarChartLuaU32.2.jpg",
    "Mars": "StarChartMarsU32.jpg", "Phobos": "StarChartPhobosU32.jpg",
    "Deimos": "StarChartDeimosU32.jpg", "Ceres": "StarChartCeresU32.jpg",
    "Jupiter": "StarChartJupiterU32.jpg", "Europa": "StarChartEuropaU32.jpg",
    "Saturn": "StarChartSaturnU32.jpg", "Uranus": "StarChartUranusU32.jpg",
    "Neptune": "StarChartNeptuneU32.jpg", "Eris": "StarChartErisU32.jpg",
    "Sedna": "StarChartSednaU32.jpg", "Pluto": "StarChartPlutoU32.jpg",
    "Void": "StarChartVoidU32.jpg", "Kuva Fortress": "StarChartKuvaFortressU32.jpg",
    "Zariman": "StarChartZarimanU32.jpg", "Earth Proxima": "StarChartEarthProximaU32.jpg",
    "Venus Proxima": "StarChartVenusProximaU32.jpg", "Saturn Proxima": "StarChartSaturnProximaU32.jpg",
    "Neptune Proxima": "StarChartNeptuneProximaU32.jpg", "Pluto Proxima": "StarChartPlutoProximaU32.jpg",
    "Veil Proxima": "StarChartVeilProximaU32.jpg",
}

# Coordinates are marker centres in the 1920 x 1080 Wiki gallery images.
TRACED: dict[str, dict[str, tuple[int, int]]] = {
    "Mercury": dict([("tolstoj",(484,171)),("odin",(281,253)),("suisei",(287,404)),("elion",(431,593)),("caloris",(580,848)),("pantheon",(920,922)),("apollodorus",(863,197)),("boethius",(938,486)),("m-prime",(865,716)),("lares",(1053,332)),("terminus",(1099,551)),("larunda-relay",(1116,784))]),
    "Ceres": dict([("bode",(903,638)),("casta",(841,754)),("cinxia",(884,390)),("exta",(555,547)),("gabii",(590,874)),("ker",(513,418)),("ludi",(495,662)),("nuovo",(722,496)),("pallas",(954,529)),("seimeni",(703,690)),("thon",(845,268))]),
    "Deimos": dict([("dirus",(851,591)),("exequias",(1312,656)),("formido",(599,504)),("hyf",(733,646)),("magnacidium",(955,756)),("necralisk",(977,402)),("phlegyas",(683,356)),("terrorem",(1052,791))]),
    "Earth": dict([("cetus",(1088,398)),("coba",(1340,411)),("erpo",(1491,614)),("eurasia",(1215,294)),("everest",(1218,483)),("gaia",(1078,760)),("lith",(897,668)),("mantle",(963,556)),("mariana",(907,451)),("mars-junction",(1191,198)),("pacific",(1347,859)),("plains-of-eidolon",(1160,364)),("strata-relay",(775,224)),("tikal",(1254,618)),("venus-junction",(1034,901))]),
    "Earth Proxima": dict([("earth-bendar-cluster",(1317,237)),("free-flight",(1499,571)),("earth-iota-temple",(676,758)),("earth-korm-s-belt",(595,406)),("earth-sover-strait",(1164,945))]),
    "Eris": dict([("akkad",(1144,248)),("isos",(1324,683)),("jordas-golem-assassinate",(1382,254)),("naeglar",(1232,828)),("nimus",(1301,365)),("oestrus",(1236,488)),("solium",(1411,556)),("xini",(699,582)),("zabala",(690,379))]),
    "Europa": dict([("abaddon",(750,370)),("armaros",(522,228)),("baal",(231,566)),("cholistan",(503,376)),("kokabiel",(933,366)),("larzac",(652,457)),("naamah",(719,282)),("orias",(962,538)),("paimon",(578,641)),("sorath",(588,773)),("valac",(1115,384))]),
    "Jupiter": dict([("adrastea",(1179,590)),("amalthea",(649,523)),("ananke",(661,305)),("callisto",(790,416)),("cameria",(910,403)),("carme",(608,203)),("elara",(1093,411)),("europa-junction",(458,487)),("galilea",(402,838)),("ganymede",(867,699)),("metis",(949,230)),("saturn-junction",(775,893)),("sinai",(736,628)),("the-ropalolyst",(909,558)),("thebe",(498,691))]),
    "Kuva Fortress": dict([("garus",(716,438)),("koro",(888,715)),("nabuk",(899,568)),("pago",(942,440)),("rotuma",(709,578)),("tamu",(625,313)),("taveuni",(843,318))]),
    "Lua": dict([("copernicus",(1227,414)),("grimaldi",(1200,531)),("pavlov",(1419,636)),("sto-fler",(1209,671)),("tycho",(1428,448)),("zeipel",(1267,315))]),
    "Mars": dict([("alator",(820,246)),("ara",(839,384)),("ares",(918,523)),("arval",(1051,552)),("augustus",(1079,355)),("ceres-junction",(569,318)),("gradivus",(1256,294)),("kadesh",(815,731)),("maroo-s-bazaar",(1368,549)),("olympus",(1205,478)),("phobos-junction",(1397,258)),("spear",(1008,670)),("syrtis",(714,186)),("tharsis",(1263,620)),("ultor",(996,195)),("vallis",(539,580)),("wahiba",(1099,152)),("war",(727,626))]),
    "Neptune Proxima": dict([("neptune-enkidu-ice-drifts",(574,748)),("neptune-mammon-s-prospect",(434,527)),("neptune-nu-gua-mines",(1397,878)),("neptune-sovereign-grasp",(833,172)),("neptune-arva-vector",(1631,533))]),
    "Neptune": dict([("despina",(899,342)),("galatea",(821,503)),("kelashin",(1387,194)),("laomedeia",(1191,463)),("larissa",(774,844)),("nereid",(1210,715)),("neso",(985,786)),("pluto-junction",(1473,320)),("proteus",(1294,185)),("psamathe",(1202,473)),("salacia",(1342,844)),("sao",(1096,296)),("triton",(758,686)),("yursa",(1518,679))]),
    "Phobos": dict([("gulliver",(1436,649)),("kepler",(1429,431)),("monolith",(977,201)),("sharpless",(1021,791)),("shklovsky",(924,624)),("skyresh",(897,375)),("stickney",(803,273)),("zeugma",(1295,472))]),
    "Pluto Proxima": dict([("pluto-fenton-s-field",(885,949)),("pluto-khufu-envoy",(1472,342)),("pluto-obol-crossing",(1267,862)),("pluto-peregrine-axis",(639,300)),("pluto-profit-margin",(708,757)),("pluto-seven-sirens",(1563,689))]),
    "Pluto": dict([("acheron",(993,423)),("cerberus",(1452,551)),("cypress",(1513,679)),("eris-junction",(848,334)),("hades",(1346,337)),("hieracon",(1178,289)),("hydra",(1230,854)),("minthe",(1054,721)),("narcissus",(1365,728)),("orcus-relay",(888,635)),("outer-terminus",(1259,542)),("palus",(1513,435)),("sechura",(1347,467))]),
    "Saturn Proxima": dict([("saturn-kasio-s-rest",(347,320)),("saturn-lupal-pass",(1408,334)),("saturn-mordo-cluster",(1087,800)),("saturn-nodo-gap",(566,850))]),
    "Saturn": dict([("cassini",(952,308)),("dione",(529,358)),("enceladus",(1256,585)),("helene",(1143,712)),("keeler",(269,636)),("kronia-relay",(844,196)),("rhea",(156,590)),("titan",(1391,624)),("uranus-junction",(1049,859))]),
    "Sedna": dict([("adaro",(1275,713)),("amarna",(1304,188)),("hydron",(1308,314)),("kappa",(1472,228)),("kelpie",(754,720)),("marid",(960,697)),("merrow",(1069,356)),("naga",(1430,638)),("nakki",(1004,544)),("rusalka",(1400,502)),("sangeru",(1138,615)),("selkie",(1171,837)),("vodyanoi",(845,504)),("yam",(939,422))]),
    "Uranus": dict([("ariel",(626,477)),("assur",(1058,823)),("caelus",(1087,283)),("caliban",(615,829)),("titania",(1107,563)),("sycorax",(412,571)),("umbriel",(886,884)),("ur",(865,157))]),
    "Veil Proxima": dict([("veil-proxima-arc-silver",(683,590)),("veil-proxima-calabash",(388,846)),("veil-proxima-erato",(518,389)),("veil-proxima-flexa",(1123,623)),("veil-proxima-h-2-cloud",(1335,818)),("veil-proxima-lu-yan",(889,516)),("veil-proxima-nsu-grid",(1334,491)),("veil-proxima-numina",(430,654)),("veil-proxima-r-9-cloud",(957,910)),("veil-proxima-sabmir-cloud",(972,429))]),
    "Venus Proxima": dict([("venus-beacon-shield-ring",(1551,747)),("venus-bifrost-echo",(1485,427)),("venus-falling-glory",(386,219)),("venus-luckless-expanse",(552,868)),("venus-orvin-haarc",(1022,945)),("venus-vesper-strait",(399,709))]),
    "Venus": dict([("cytherean",(713,808)),("e-gate",(1361,560)),("fortuna",(1048,693)),("fossa",(600,443)),("ishtar",(811,254)),("malva",(695,197)),("mercury-junction",(601,599)),("montes",(836,158)),("orb-vallis",(1021,765)),("romula",(1412,868)),("tessera",(1211,390)),("v-prime",(1325,734)),("vesper-relay",(1410,300))]),
    "Void": dict([("aten",(388,257)),("belenus",(548,636)),("hepit",(918,399)),("marduk",(407,420)),("mithra",(554,473)),("oxomoco",(396,707)),("stribog",(1208,742)),("taranis",(757,411)),("tiwaz",(1169,607)),("ukko",(715,761))]),
    "Zariman": dict([("chrysalith",(849,580)),("dormizone",(907,649)),("everview-arc",(894,296)),("halako-perimeter",(950,475)),("oro-works",(872,810)),("the-greenway",(757,701))]),
}

# Based on the labelled late-game overview. Kuva Fortress is intentionally
# pinned into the open Pluto/Neptune area because its live orbit is not useful
# as permanent presentation geometry.
OVERVIEW = {
    "Sedna": (.500,.107,.013), "Sanctuary": (.213,.240,.017), "Zariman": (.120,.344,.018),
    "Ceres": (.404,.289,.014), "Deimos": (.541,.374,.014), "Mars": (.602,.338,.014),
    "Phobos": (.677,.249,.011), "Eris": (.739,.322,.013), "Void": (.127,.499,.018),
    "Europa": (.225,.499,.013), "Jupiter": (.302,.494,.027), "Mercury": (.441,.590,.012),
    "Venus": (.545,.665,.014), "Earth": (.631,.499,.016), "Lua": (.677,.499,.012),
    "Pluto": (.836,.494,.014), "Saturn": (.360,.739,.019), "Uranus": (.500,.858,.022),
    "Neptune": (.727,.775,.018), "Kuva Fortress": (.705,.685,.014),
}


def scope(planet: str) -> str:
    if planet.lower().endswith(" proxima"):
        return "railjack"
    if planet.startswith(("Dark Refractory", "Duviri", "Sanctuary")):
        return "other"
    return "origin"


def active_nodes() -> dict[str, list[tuple[str, str]]]:
    connection = sqlite3.connect(DATABASE)
    rows = connection.execute("""
        with ranked as (
          select detail.entity_id, detail.planet, source.priority,
            run.retrieved_at, source.id source_id, detail.source_record_key,
            row_number() over (
              partition by detail.entity_id
              order by source.priority desc, run.retrieved_at desc,
                source.id, detail.source_record_key, detail.id
            ) position
          from node_details detail
          join source_runs run on run.id = detail.source_run_id and run.status = 'active'
          join sources source on source.id = run.source_id
        )
        select ranked.planet, entity.name, entity.slug
        from entities entity join ranked on ranked.entity_id = entity.id and ranked.position = 1
        where entity.kind = 'node' and entity.retired = 0
        order by ranked.planet collate nocase, entity.name collate nocase, entity.slug
    """).fetchall()
    connection.close()
    result: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for planet, name, slug in rows:
        result[planet].append((name, slug))
    return dict(result)


def queue_points(count: int) -> list[dict[str, float]]:
    if not count:
        return []
    return [{"x": round((index + 1) / (count + 1), 6), "y": .965, "radius": .006}
            for index in range(count)]


def main() -> None:
    catalog = active_nodes()
    overview = {name: {"x": x, "y": y, "radius": radius}
                for name, (x, y, radius) in OVERVIEW.items() if name in catalog}
    by_scope: dict[str, list[str]] = defaultdict(list)
    for planet in catalog:
        if planet not in overview:
            by_scope[scope(planet)].append(planet)
    for planets in by_scope.values():
        for planet, point in zip(sorted(planets), queue_points(len(planets))):
            overview[planet] = point

    planets = {}
    for planet, nodes in catalog.items():
        traced = TRACED.get(planet, {})
        node_map = {
            slug: {"x": round(x / IMAGE_WIDTH, 6), "y": round(y / IMAGE_HEIGHT, 6), "radius": .006}
            for slug, (x, y) in traced.items()
            if any(candidate_slug == slug for _, candidate_slug in nodes)
        }
        missing = [(name, slug) for name, slug in nodes if slug not in node_map]
        for (_, slug), point in zip(missing, queue_points(len(missing))):
            node_map[slug] = point
        planets[planet] = {"nodes": node_map}

    layout = {
        "schemaVersion": 1,
        "sourceImages": {
            "overview": {"name": "StarChartLateGameLabeled.jpg", "width": 1280, "height": 720},
            **{planet: {"name": name, "width": IMAGE_WIDTH, "height": IMAGE_HEIGHT}
               for planet, name in SCREENSHOTS.items()},
        },
        "overview": {"planets": overview},
        "planets": planets,
    }
    OUTPUT.write_text(json.dumps(layout, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(catalog)} locations, "
          f"{sum(len(nodes) for nodes in catalog.values())} nodes")


if __name__ == "__main__":
    main()
