# Face fixtures

Used by `tests/integration/enrollment.test.ts` (real InsightFace-REST, compose service `insightface`,
detector `scrfd_500m_gnkps`, recognizer `w600k_mbf`, detection threshold 0.6).

| File | Source | Licence | InsightFace result |
|---|---|---|---|
| `person-a-1.jpg` | `libs/InsightFace-REST/misc/test_images/TH1.jpg` (unchanged copy) | Apache-2.0 (InsightFace-REST) | 1 face, score 0.64, 186 px |
| `person-a-2.png` | `libs/InsightFace-REST/misc/test_images/TH.png` (unchanged copy) | Apache-2.0 (InsightFace-REST) | 1 face, score 0.61, 81 px |
| `person-b.jpg` | `libs/InsightFace-REST/misc/test_images/Stallone.jpg` (unchanged copy) | Apache-2.0 (InsightFace-REST) | 1 face, score 0.80, 58 px |
| `group.jpg` | `libs/InsightFace-REST/misc/test_images/mask.jpg` (unchanged copy) | Apache-2.0 (InsightFace-REST) | 4 faces |
| `no-face.jpg` | first frame of `docker/stream-server/videos/serverroom.mp4`, top-left 480x360 crop (`ffmpeg -i serverroom.mp4 -frames:v 1 -vf crop=480:360:0:0 -q:v 3 no-face.jpg`) | Pexels licence (stream-server sample video) | 0 faces |

`person-a-1` and `person-a-2` are two different photos of the same person: cosine distance 0.41 between their
embeddings (below the default recognition threshold 0.5). Between different people the distance is above 0.9.
Measured on 2026-10-19; re-check with a probe of `/extract` if the InsightFace models change.
