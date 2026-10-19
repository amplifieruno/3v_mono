# Face fixtures

Used by the enrollment integration tests (`tests/integration/enrollment*.test.ts`; real InsightFace-REST, compose
service `insightface`, detector `scrfd_500m_gnkps`, recognizer `w600k_mbf`, detection threshold 0.6).

| File | Source | Photo rights | InsightFace result |
|---|---|---|---|
| `person-a-1.jpg` | `libs/InsightFace-REST/misc/test_images/TH1.jpg` (unchanged copy) | Uncertain (see below) | 1 face, score 0.64, 186 px |
| `person-a-2.png` | `libs/InsightFace-REST/misc/test_images/TH.png` (unchanged copy) | Uncertain (see below) | 1 face, score 0.61, 81 px |
| `person-b.jpg` | `libs/InsightFace-REST/misc/test_images/Stallone.jpg` (unchanged copy) | Uncertain (see below) | 1 face, score 0.80, 58 px |
| `group.jpg` | `libs/InsightFace-REST/misc/test_images/mask.jpg` (unchanged copy) | Uncertain (see below) | 4 faces |
| `no-face.jpg` | first frame of `docker/stream-server/videos/serverroom.mp4`, top-left 480x360 crop (`ffmpeg -i serverroom.mp4 -frames:v 1 -vf crop=480:360:0:0 -q:v 3 no-face.jpg`) | Pexels License (stream-server sample video) | 0 faces |

**Provenance.** The four photos of people are test images shipped with the InsightFace-REST repository (git
submodule `libs/InsightFace-REST`). That repository is licensed Apache-2.0, but the licence covers its source code;
it does not establish who holds the rights to these photographs (some appear to show public figures) or whether the
people shown agreed to redistribution. Treat their rights as uncertain: they are kept here only as local test
inputs for face detection/recognition, are never shown in the product UI or seed data, and should be replaced by
licensed or synthetic faces before any public distribution of this repository.

`person-a-1` and `person-a-2` are two different photos of the same person: cosine distance 0.41 between their
embeddings (below the default recognition threshold 0.5). Between different people the distance is above 0.9.
Measured on 2026-10-19; re-check with a probe of `/extract` if the InsightFace models change.
