# Competitor Ranking

Reviewed on 2026-06-04 from the public GitHub pages supplied in the prompt.

## Ranking Criteria

1. Judge testability: APK/release or clear build path.
2. Completeness: mobile app screens, enrollment, authentication, local storage, sync.
3. Offline credibility: bundled models/assets and no first-run network dependency.
4. Evidence: benchmarks, model footprint, screenshots, docs, demo flow.
5. Honesty: claims that appear supported by committed code/artifacts.

## Ranked List

| Rank | Project | Why |
| --- | --- | --- |
| 1 | [`destimeus-hub/FaceAuthOffline`](https://github.com/destimeus-hub/FaceAuthOffline) | Strongest deliverability. It has a published release APK, install instructions, screenshots, benchmark section, architecture docs, and a release entry. Even if implementation quality still needs audit, judges can immediately test it. |
| 2 | [`moneytosms/offlineid`](https://github.com/moneytosms/offlineid) | Strong README and strongest practical build story after destimeus. It documents a release APK build, model footprint, offline demo flow, iOS notes, and specific Windows CMake caveats. No public release artifact found, so it ranks below the repo with an APK. |
| 3 | [`Jaiadithya71/nhai-secure-face-auth`](https://github.com/Jaiadithya71/nhai-secure-face-auth) | Looks like a more realistic React Native native app stack: VisionCamera, fast TFLite, SQLCipher, Keychain/Keystore, TypeScript plus native languages. No release APK, so testability is weaker. |
| 4 | [`Ani-sha23/hackathon7-faceshield`](https://github.com/Ani-sha23/hackathon7-faceshield) | Clear Datalake positioning, docs/presentation files, claimed model sizes and performance, and good integration framing. No published release, and it appears README-heavy with only a small commit history. |
| 5 | [`Tanmay-Dalvi/datalake_faceid-apk`](https://github.com/Tanmay-Dalvi/datalake_faceid-apk) | Polished story and a web demo file, with Supabase/cloud sync and model claims. No release artifact, and the README asks users to provide model files, which weakens offline deliverability. |
| 6 | [`spg3098-alt/FaceAuthApp`](https://github.com/spg3098-alt/FaceAuthApp) | Good concise requirements match: offline, TFLite, SQLite, AWS sync/purge, model footprint. No release APK and no obvious stronger proof artifacts. |
| 7 | [`brajesh1210/DataLakeFaceAuth`](https://github.com/brajesh1210/DataLakeFaceAuth) | React Native-looking repo, but weaker public evidence from the page and no release. Needs deeper source audit before trusting feature claims. |
| 8 | [`Aditi6789/NHAI-Hackathon-7-Offline-FaceRec`](https://github.com/Aditi6789/NHAI-Hackathon-7-Offline-FaceRec) | Very lightweight browser/face-api.js submission with only a README visible. It reports 94.2% accuracy, below the stated 95% target, and has no release. |
| 9 | [`pandeyysurabhi/NHAI-Face-Detection`](https://github.com/pandeyysurabhi/NHAI-Face-Detection) | Useful ML/model repo, but not a complete Datalake/mobile/offline attendance product. No README/release and only face-detection artifacts. |

## Where Aegis Ranks Today

With the current fixes, Aegis is conceptually stronger than most because it has a Rust engine, native module, bundled ONNX assets, React Native screens, tests, and an AWS scaffold. In judge-facing readiness, it currently ranks around `3-4` unless the frame-processor APK build is fixed and a release APK is uploaded.

If the full live-camera APK is released, Aegis can compete for rank `1-2` because its architecture is deeper than the simpler TFLite/Expo submissions. Without that APK, `destimeus-hub/FaceAuthOffline` and `moneytosms/offlineid` remain more deliverable.

## Immediate Moves To Beat The Field

- Publish a downloadable Android APK.
- Fix the VisionCamera/worklets frame-processor build so the APK is a real live-camera demo, not a packaging-only workaround.
- Add screenshots or a demo video.
- Keep the README honest with the current-status table.
- Add one reproducible benchmark table from a physical Android phone.
- Add a short submission deck under `submission/`.
