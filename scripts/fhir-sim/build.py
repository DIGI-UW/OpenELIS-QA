#!/usr/bin/env python3
"""Build the FHIR transaction bundles that play a simulated external reference lab.

Used 2026-09-28 against testing 3.2.3.0 (release-qa-3.2.3 R83 to R90). Ids are fixed so a
rerun overwrites the same resources. Writes bundles/*.json; push each with push.sh.

"This lab" is QA_AUTO Reference Lab Alpha (ALPHA). Point the webapp at the simulator with
  org.openelisglobal.remote.source.uri=http://qa-extlab-fhir:8080/fhir
  org.openelisglobal.remote.source.identifier=Organization/<ALPHA>
and restart it (see README.md).
"""
import json, os

ALPHA = "5edc6268-f23c-42a9-be47-d692c87e5ddb"   # QA_AUTO Reference Lab Alpha on testing
BETA = "8c7fef6d-801f-4acd-b285-b297009feeb4"    # QA_AUTO Reference Lab Beta
E = "http://openelis.org/fhir/extension/"
OE = "http://openelis-global.org"
SPEC = ["5813d934-3277-43bb-a7dc-ef0b0d9729e2", "b5ad2a04-6e26-4c2c-abda-112e21b3ea21", "de502fa5-ee4d-4f8f-9c7c-f99a6c7205d6"]
XSS = '<img src=x onerror="window.__qaxss=1">QA <b>bold</b>'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bundles")


def ext(n, **v):
    return {"url": E + n, **v}


def sd(box, rid, dest=ALPHA, qty=1, specs=SPEC[:1], temp="2-8C", notes=None, status="in-progress",
       src="QA External Reference Lab", cap=10, idsys="http://openelis.org/shipment/box-id"):
    """A SupplyDelivery as ShipmentFhirImportService reads it."""
    exts = []
    if dest:
        exts.append(ext("shipment-destination-org", valueString=dest))
    exts += [ext("shipment-source-org", valueString=src), ext("shipment-temperature", valueString=temp),
             ext("shipment-capacity", valueInteger=cap)]
    if notes:
        exts.append(ext("shipment-notes", valueString=notes))
    for s in specs:
        exts.append(ext("shipment-specimen", valueReference={"reference": f"Specimen/{s}", "display": "Serum"}))
    return {"resourceType": "SupplyDelivery", "id": rid, "status": status,
            "identifier": [{"system": idsys, "value": box}], "extension": exts,
            "suppliedItem": {"quantity": {"value": qty}}, "occurrenceDateTime": "2026-09-28T08:00:00-07:00",
            "destination": {"display": "QA_AUTO Reference Lab Alpha"}}


def specimen(sid, label, patient=None):
    r = {"resourceType": "Specimen", "id": sid, "status": "available",
         "identifier": [{"system": "http://qa-extlab.example/specimen", "value": label}],
         "type": {"coding": [{"system": OE + "/sampleType", "code": "Serum", "display": "Serum"}], "text": "Serum"}}
    if patient:
        r["subject"] = {"reference": "Patient/" + patient}
        r["collection"] = {"collectedDateTime": "2026-09-28T07:15:00-07:00"}
    return r


def referral(n, order_no_is_sr_id):
    """Patient, Practitioner, Specimen, ServiceRequest (LOINC 2160-0 Creatinine) and a Task owned by ALPHA.
    Family names avoid '_' because Person.lastName validation rejects it."""
    base = f"7a1c2e10-0000-4000-8000-00000000e{n}0"
    pat, pr, sp, sr, tk = (base + str(i) for i in range(1, 6))
    order_ident = {"system": "http://qa-extlab.example/fhir/ServiceRequest", "value": sr} if order_no_is_sr_id \
        else {"system": "http://qa-extlab.example/order", "value": "QA-EXT-ORD-0001"}
    first = "Openelisstyle" if order_no_is_sr_id else "Simulated"
    return [
        {"resourceType": "Organization", "id": ALPHA, "name": "QA_AUTO Reference Lab Alpha", "active": True},
        {"resourceType": "Patient", "id": pat, "identifier": [{"system": OE + "/pat_nationalId", "value": f"QA-EXT-NID-000{int(n) + 1}"}],
         "name": [{"family": "Qaextref", "given": [first]}], "gender": "female", "birthDate": "1985-04-12"},
        {"resourceType": "Practitioner", "id": pr, "name": [{"family": "Qaextdoc", "given": ["Referring"]}],
         "telecom": [{"system": "phone", "value": "555-0100"}]},
        specimen(sp, f"QA-EXT-SPEC-REF-00{int(n) + 1}", pat),
        {"resourceType": "ServiceRequest", "id": sr, "identifier": [order_ident], "status": "active", "intent": "original-order",
         "code": {"coding": [{"system": "http://loinc.org", "code": "2160-0", "display": "Creatinine"}]},
         "subject": {"reference": "Patient/" + pat}, "requester": {"reference": "Practitioner/" + pr},
         "specimen": [{"reference": "Specimen/" + sp}], "authoredOn": "2026-09-28T07:00:00-07:00"},
        {"resourceType": "Task", "id": tk, "status": "requested", "intent": "order", "priority": "routine",
         "identifier": [{"system": "http://qa-extlab.example/task", "value": f"QA-EXT-TASK-000{int(n) + 1}"}],
         "description": "QA simulated referral from external lab",
         "basedOn": [{"reference": "ServiceRequest/" + sr}], "for": {"reference": "Patient/" + pat},
         "owner": {"reference": "Organization/" + ALPHA}, "requester": {"reference": "Practitioner/" + pr},
         "authoredOn": "2026-09-28T07:00:00-07:00"},
    ], sp


def bundle(name, res):
    os.makedirs(OUT, exist_ok=True)
    b = {"resourceType": "Bundle", "type": "transaction",
         "entry": [{"resource": r, "request": {"method": "PUT", "url": f"{r['resourceType']}/{r['id']}"}} for r in res]}
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump(b, f, indent=1)
    print(name, [f"{r['resourceType']}:{(r.get('identifier') or [{}])[0].get('value', r['id'])}" for r in res])


ref1, ref1_spec = referral("0", order_no_is_sr_id=False)
ref2, ref2_spec = referral("1", order_no_is_sr_id=True)

bundle("01-happy-and-skips", [specimen(s, f"QA-EXT-SPEC-00{i + 1}") for i, s in enumerate(SPEC)] + [
    sd("QA-EXT-BOX-0001", "533cc434-a636-42d7-81d7-eee3d4d4fe7f", qty=3, specs=SPEC, notes="QA simulated inbound box A"),
    sd("QA-EXT-BOX-0002", "ce9e2f67-e90f-4fa3-b609-cbd562a55a5c", dest=BETA, notes="QA addressed to Beta: must be skipped"),
    sd("QA-EXT-BOX-0003", "81ed1e25-f801-4cee-a011-a79d932d4d3e", qty=2, specs=SPEC[:2], status="completed", notes="QA completed: must be skipped")])
# Push 02 after setting Shipment Settings > This Laboratory to Beta (R83).
bundle("02-site-org-collision-edge", [
    sd("QA-EXT-BOX-0004", "c07195ee-88d9-43b5-bb62-bae1e3a4d778", notes="QA to Alpha while site org = Beta"),
    sd("QA-EXT-BOX-0005", "25c05e6a-631f-43e6-81a6-1b63c1d13168", dest=BETA, notes="QA to Beta while site org = Beta"),
    sd("BOX-2026-0002", "9ebc3fce-c607-4c1e-acf1-7abfca67edbb", notes="QA external box whose ID collides with a local box"),
    sd("QA-EXT-BOX-0006", "fed82e4b-5a9e-49c7-b80b-d99c634da48e", dest=None, notes="QA no destination extension"),
    sd("QA-EXT-BOX-0008", "4b605440-599f-4a14-9b5a-b963bb732818", qty=3, cap=2, notes="QA quantity 3, capacity 2, one specimen reference"),
    sd("QA-EXT-FALLBACK-0009", "0901fe0c-2f90-41de-938b-aec8c1059764", idsys="http://qa-extlab.example/box", notes="QA box ID under a foreign identifier system")])
# 03 poisons every import (R84); 03b is the sender's fix.
poison = sd("QA-EXT-BOX-0007", "60fb0b16-6c30-49ce-bdf7-394bdb3bca8e", notes=XSS, src=XSS, temp="T" * 300)
bundle("03-poison-temperature", [poison])
bundle("03b-poison-abandoned", [dict(poison, status="abandoned")])
bundle("04-valid-after-poison", [sd("QA-EXT-BOX-0011", "0b9d3c52-7a1e-4f0e-9d0a-6f2d51c0a011", notes="QA valid box sent after a malformed one")])
bundle("05-referral1-nonopenelis-order-no", ref1)
bundle("06-referral1-box", [sd("QA-EXT-BOX-0012", "7a1c2e10-0000-4000-8000-00000000e006", specs=[ref1_spec], notes="QA box carrying the simulated referral specimen")])
bundle("07-referral2-openelis-style", ref2)
bundle("08-referral2-box", [sd("QA-EXT-BOX-0014", "7a1c2e10-0000-4000-8000-00000000e106", specs=[ref2_spec], notes="QA box carrying the simulated referral specimen")])
bundle("09-injection-and-nonuuid", [
    sd("QA-EXT-BOX-0013", "7a1c2e10-0000-4000-8000-00000000e013", notes=XSS, src='QA Lab <img src=x onerror="window.__qaxss=2">', temp="2-8C <b>x</b>"),
    sd("QA-EXT-BOX-0010", "qa-ext-nonuuid-10", notes="QA non-UUID resource id")])


# ---- 10: this lab referred tests OUT; the simulator plays the reference lab returning results.
# The poller finds the remote Task by the referral's fhir_uuid (status completed), follows
# Task.basedOn to the original ServiceRequest (id = the analysis fhir_uuid), then looks for a
# completed ServiceRequest basedOn it with Observations basedOn that. Ids come from the seeded
# referrals (createDispatchedReferral tags QA_AUTO RET-*); read them with the SQL in README.
RETURNS = [
    # tag, referral fhir_uuid (Task id), analysis fhir_uuid (original SR id), kind
    ("RET-NORMAL", "05d3d31f-be18-4d22-af33-633b77bd5da9", "118de7f8-c37b-4cb8-b4ad-2f4a676023db", "normal"),
    ("RET-NP", "4af4e23f-dc1d-4e57-b8f7-e57e1bba0efc", "43b6ad4a-8bcb-4fb8-8b6a-28f59c7a95c2", "not-performed"),
    ("RET-REFLEX", "893e86ad-a450-4f3d-957d-5116a973f7cf", "61b10013-a884-4c96-b005-d5e0964cb365", "reflex"),
    ("RET-ACK", "d092d81c-86ef-44e4-9f2d-3fba6a4eedb1", "7e483ac8-d365-40ed-acf9-1f2f5460f6fb", "accepted-only"),
]
GLU = {"coding": [{"system": "http://loinc.org", "code": "2345-7", "display": "Glucose"}]}
ALT = {"coding": [{"system": "http://loinc.org", "code": "1742-6", "display": "Alanine aminotransferase"}]}


def ret_bundle(tag, task_id, sr_id, kind):
    n = task_id[:8]
    done_sr = f"7a1c2e10-0000-4000-8000-{n}0001"[:36]
    res = [
        {"resourceType": "ServiceRequest", "id": sr_id, "status": "active", "intent": "original-order", "code": GLU,
         "subject": {"display": tag}},
        {"resourceType": "Task", "id": task_id, "status": "accepted" if kind == "accepted-only" else "completed",
         "intent": "order", "basedOn": [{"reference": "ServiceRequest/" + sr_id}],
         "owner": {"reference": "Organization/" + ALPHA}, "description": f"QA reference-lab return {tag}"},
    ]
    if kind == "accepted-only":
        return res
    res.append({"resourceType": "ServiceRequest", "id": done_sr, "status": "completed", "intent": "order", "code": GLU,
                "basedOn": [{"reference": "ServiceRequest/" + sr_id}]})

    def obs(oid, code, **kw):
        o = {"resourceType": "Observation", "id": oid, "status": "final", "code": code,
             "basedOn": [{"reference": "ServiceRequest/" + done_sr}], "issued": "2026-09-28T09:00:00Z"}
        o.update(kw)
        return o
    if kind == "normal":
        res.append(obs(f"{done_sr[:-4]}0101", GLU, valueQuantity={"value": 5.4, "unit": "mmol/L"}))
    elif kind == "not-performed":
        res.append(obs(f"{done_sr[:-4]}0201", GLU, status="cancelled",
                       dataAbsentReason={"coding": [{"system": "http://terminology.hl7.org/CodeSystem/data-absent-reason", "code": "not-performed", "display": "Not Performed"}]},
                       note=[{"text": "QA: specimen haemolysed at reference lab, test not performed"}]))
    elif kind == "reflex":
        res.append(obs(f"{done_sr[:-4]}0301", GLU, valueQuantity={"value": 12.0, "unit": "mmol/L"},
                       interpretation=[{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", "code": "H"}]}]))
        res.append(obs(f"{done_sr[:-4]}0302", ALT, valueQuantity={"value": 44, "unit": "U/L"},
                       note=[{"text": "QA: reflex test added by the reference lab"}]))
    return res


for tag, task_id, sr_id, kind in RETURNS:
    bundle(f"10-return-{tag.lower()}", ret_bundle(tag, task_id, sr_id, kind))
