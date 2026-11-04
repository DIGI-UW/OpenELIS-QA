# QA_AUTO microbiology seed

Synthetic reference data for the AMR / Microbiology checks on testing. **Not for clinical use.**
`helpers/amr-seed.ts` (`ensureAmrSeed`) imports these files through Admin configuration import when the
panel is missing, then finds or creates the rest by name.

| File | Domain | Content |
|---|---|---|
| microbiology-organisms-qa.csv | microbiology-organisms | E. coli (eco), K. pneumoniae (kpn) |
| microbiology-antimicrobials-qa.csv | microbiology-antimicrobials | AMP, AMC, CRO, CAZ, FEP, CIP, GEN, AMK, SXT, MEM |
| microbiology-breakpoints-qa.csv | microbiology-breakpoints | Edition CLSI QA-AUTO-1104, MIC mg/L, invented values |
| microbiology-ast-panels-qa.csv | microbiology-ast-panels | "QA_AUTO Gram negative rods (10)"; Meropenem SUPPRESS_UNLESS_RESISTANT |

The helper also makes sure of: the edition is active (effective 2026-01-01) and the default; lab unit
"QA_AUTO Micro"; test "QA_AUTO Urine culture" (QAUCX, Urines, opens a case, CULTURE role); inventory
item "QA_AUTO MacConkey agar" (microbiology medium, lots not tracked); programme "QA_AUTO Clinical
bacteriology" (QA_BACT, shown on the microbiology case, Bacterial track). Imported editions load
inactive, and a changed panel CSV publishes a new panel version.

Note: making QA-AUTO-1104 the default edition changes the default for everyone on that server.
