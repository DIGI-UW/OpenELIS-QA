# Simulated external reference lab (FHIR)

Plays another lab that sends this OpenELIS inbound shipments (SupplyDelivery) and referrals
(Task + ServiceRequest + Patient + Specimen), so Receive Box > Import from FHIR, reception and
Accept Sample can be tested end to end. First used 2026-09-28 on testing 3.2.3.0
(release-qa-3.2.3 R83 to R90; `tests/fhir-inbound-shipment.spec.ts`; catalogue TC-SHIPF).

## Setup on the server (needs SSH and a webapp restart)

1. Start a plain-HTTP HAPI server on the compose network, with no host port:
   `docker run -d --name qa-extlab-fhir --network openelis-testing_default -e hapi.fhir.fhir_version=R4 -e hapi.fhir.allow_external_references=true -e hapi.fhir.enforce_referential_integrity_on_write=false hapiproject/hapi:latest`
2. Back up `volume/properties/common.properties` in the release folder, then set
   `org.openelisglobal.remote.source.uri=http://qa-extlab-fhir:8080/fhir` and
   `org.openelisglobal.remote.source.identifier=Organization/5edc6268-f23c-42a9-be47-d692c87e5ddb`
   (QA_AUTO Reference Lab Alpha plays "this lab"). The shipped default `Practitioner/*` can never match a box.
3. `docker restart openelisglobal-webapp`. The file is bind-mounted, and `sed -i` replaces the inode, so the container only sees the change after a restart.
4. Referrals only: the Task search is by owner, and HAPI indexes the owner only if the
   Organization exists, so bundles 05 and 07 include it. Add Order reads the referral only when
   Order Entry Configuration > external orders is true.

## Run

    python3 scripts/fhir-sim/build.py
    scripts/fhir-sim/push.sh scripts/fhir-sim/bundles/01-happy-and-skips.json
    # then press Import from FHIR on Receive Box

The referral poller runs every 2 minutes (remote.poll.frequency), so push 05 or 07, wait,
then push the matching box (06 or 08). Bundle 03 blocks every import until 03b is pushed (R84).

## Results coming back from a reference lab (bundles 10-return-*)

Here the simulator plays the reference lab for a referral this lab sent out.

1. Seed referrals in REQUESTED with `createDispatchedReferral(page, 'QA_AUTO RET-NORMAL')` (and RET-NP, RET-REFLEX, RET-ACK).
2. Read their ids and put them in `RETURNS` in build.py:

       select r.fhir_uuid as task_id, a.fhir_uuid as service_request_id
       from clinlims.referral r join clinlims.analysis a on a.id = r.analysis_id
       where r.id in (...);

3. Rebuild, push the four `10-return-*` bundles, wait for the poller (2 minutes).
   RET-ACK moves to At reference lab; the others appear under Returned on Reference Lab Results.
4. Run `tests/referral-return-fhir.spec.ts`.

## Clean up

`docker rm -f qa-extlab-fhir`, restore common.properties from the backup, restart the webapp.
A redeploy also resets the properties file.
