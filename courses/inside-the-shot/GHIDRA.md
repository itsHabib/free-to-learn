# Inspect the owned targets with Ghidra

Ghidra imports machine code, identifies possible functions and produces a C-like explanation called **decompilation**. That explanation is a hypothesis about behavior. It does not recover the author's original names or source text. Keep using native probes to test it.

Use this companion after saving the prediction required by the milestone and reaching its instruction-inspection step. The existing M1 v0.6 and M2 v0.5 archives remain unchanged. Their setup notes describe the earlier build; this page records the later tool validation. Do not copy a decompilation into an earlier record and present it as your first prediction.

## Tool identity and installation

The tested toolchain is Apple Silicon macOS, Ghidra **12.1.4**, Temurin JDK **21.0.12.1+1**, Python **3.14.6**, and Apple clang **21.0.0**. The Java runtime and Ghidra were extracted into a dedicated directory. No global Java registration, shell-profile edit, driver, VM or OS-security change was required.

Use the official [Ghidra release](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build), [version-pinned setup guide](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_12.1.4_build/GhidraDocs/GettingStarted.md), and [Temurin JDK release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.12.1%2B1). Download the named release assets, not the source-code archives. Before extracting, compare their SHA-256 hashes:

| Asset | SHA-256 |
| --- | --- |
| `ghidra_12.1.4_PUBLIC_20260921.zip` | `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db` |
| `OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.12.1_1.tar.gz` | `3623232f33a9c3baadf304480b2535f9a3cba8a58d42ecbb438ba267315d9998` |

The archives total approximately 770 MB and expand to approximately 1.26 GB together. Allow additional room for the native build, Gradle, projects and your records. Extract into new directories; never overwrite another installation. On this JDK distribution, the Java home is the extracted `jdk-21.0.12.1+1/Contents/Home` directory.

Ghidra's release requires a native-component build for Apple Silicon. In its `support/gradle` directory, the official procedure is `./gradlew buildNatives`. Give that process the JDK21 `JAVA_HOME`; the tested run used `--no-daemon --max-workers=2` and a separate `GRADLE_USER_HOME`. The shipped wrapper uses Gradle **9.7.1**. Its official distribution SHA-256 is `acd53f1edaf02f1a8ff99879f8a34b302661a057d9b063ae9e35b552f804d20a`; pin it as `distributionSha256Sum` in that installation's wrapper properties before the first download. The native build must finish successfully before you proceed.

To apply that setup, first check the JDK by running its `bin/java -version`. In a terminal, enter the extracted Ghidra `support/gradle` folder. Open its `gradle-wrapper.properties` in a text editor and add this line if it is absent:

```properties
distributionSha256Sum=acd53f1edaf02f1a8ff99879f8a34b302661a057d9b063ae9e35b552f804d20a
```

An environment variable is a named setting passed to a program. `JAVA_HOME` tells this build where the JDK is; `GRADLE_USER_HOME` chooses its download/cache folder. The `env` command below sets them for this one command, without editing a shell profile. Replace both paths with your actual JDK directory and a new cache folder:

```sh
env JAVA_HOME="/path/to/jdk-21.0.12.1+1/Contents/Home" GRADLE_USER_HOME="/path/to/new-gradle-cache" ./gradlew --no-daemon --max-workers=2 buildNatives
```

The first run downloads the pinned Gradle distribution. Stop on a checksum failure or build failure and preserve the output. Continue only after `BUILD SUCCESSFUL`; the tested build produced the ARM64 decompiler, sleigh, demanglers and file-format helper. This is a compiler/setup checkpoint, not a successful target import yet.

If an OS permission or security dialog prevents launch, preserve the error and stop that route. Do not disable protections or remove quarantine attributes as a course step. Use the supplied listing while arranging the tool issue separately.

## Run the command-line inspection

**Headless** means that Ghidra runs without its graphical window. This route performs real import, analysis and decompilation. It does not test graphical navigation, screen-reader access or your interpretation.

From the complete student bundle's top-level folder, use `tools/inspect_ghidra.py`. In the private source checkout, first enter `courses/re-lab` to use the same relative path. This helper and its adjacent `CourseEvidence.java` contain export plumbing, not the target's answer. It writes logs, a Ghidra project, decompilation and an exact-target receipt to new paths. It never installs tools or replaces earlier evidence.

For the already-investigated M1 `cart`, replace the four example paths below with your extracted tool directories, target and a new private output directory. Quotes keep spaces in a path together. You can drag a directory into Terminal to obtain its path. `--symbol` names the function seen in the supplied listing.

```sh
python3 tools/inspect_ghidra.py \
  --ghidra "/path/to/ghidra_12.1.4_PUBLIC" \
  --java-home "/path/to/jdk-21.0.12.1+1/Contents/Home" \
  --target "/path/to/m1-student/cart" \
  --symbol lab_step \
  --out "/path/to/new-cart-evidence"
```

Ghidra refuses a project path containing a hidden component such as `.tmp` or `.claude`. If your output is inside one, add `--project-root "/tmp/re-lab-project-01"`, using a new name for each run. The helper records that external project location in `run.json`; keep it with the evidence. `/tmp` can be cleared by the operating system, so copy a finished project into your own durable storage before relying on it long-term. Do not reuse or delete an older project to silence a refusal.

The successful command prints the path to `run.json`. Open it and `evidence.json` in a text editor. Verify `status` is `passed`, the target hash matches your manifest, and all requested functions appear. Ghidra reports the supplied targets as `Mac OS X Mach-O`, with language `AARCH64:LE:64:AppleSilicon`.

For M1's other two targets, change `--target` and use a new output/project name; `lab_step` remains the function. For M2's `parcel` and `parcel-shifted`, replace the symbol argument with four arguments:

```text
--symbol initialize_parcel --symbol adjust_credit --symbol score_parcel --symbol process_parcel
```

For M6, inspect `quote-O0` and `quote-O2` with `--symbol quote`; the separate worked targets `fee-O0` and `fee-O2` use `--symbol fee_example`. For M7, inspect `reserve`, `reserve-atomic` and `reserve-opt` with `--symbol decode_record --symbol apply_record --symbol replay`. Use a new output and project name every time. M3/M4 work directly with file bytes and a Python parser, and M5 traces Python processes; their exercises do not require Ghidra.

## Compare representations before accepting a claim

1. Choose a short instruction range already traced in your notebook. Find its address and text in `evidence.json`, then compare them with the supplied `.asm` listing. Leading underscores in function names are normal for these targets.
2. Identify the same input, arithmetic operation, branch or memory update in `decompiled_c`. Temporary names such as `local_18`, `param_1` and types such as `undefined4` are generated labels. They are not evidence of the original source spelling, field names or intended signedness.
3. Write a claim and a competing explanation. Predict a native input that would distinguish them, save that prediction, then execute the target. Keep the result beside the prediction. A clean-looking decompilation does not replace this check.
4. Add the target hash, tool versions, function entry, relevant addresses and observed result to a new notebook record. If you opened a hint or answer, use the milestone's assistance field. Keep the old record unchanged.

This is the same evidence habit as the supplied-listing route. The additional tool helps you move between representations; it does not certify a correct model or an independent attempt.

**M2 caution: machine evidence and a reported decompilation.** In the supplied `parcel` listings, `_process_parcel` calls `_score_parcel` and then restores the frame and returns without changing `w0`. Four selected author probes of the exact delivered targets agree with the score calculation. This review did not recover the historical generated-C export, so the reported `void` return type and shifted `undefined2 *` pointer example remain unverified tool observations; do not infer either from the assembly alone. Follow the register value across the call instead of treating the guessed `void` type as proof that no result returns. Compare actual load/store widths and byte offsets before accepting a field map.

## Diagnose a failed run

An existing output/project directory is a preservation refusal: choose a new name. A missing Java or launcher path means the directory argument is wrong or setup is incomplete. A missing function can mean the symbol was mistyped or the target does not match the listing. Do not guess a result from a partially written file.

Keep `run.json`, `console.log`, `analysis.log` and `script.log`. A zero Ghidra process exit alone is insufficient: the helper also requires a complete export of every requested function. If no successful evidence receipt exists, label the run failed and continue with the supplied listing until the concrete error is resolved.

## Graphical route and remaining limits

The [official introductory guide](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_12.1.4_build/GhidraDocs/GhidraClass/Beginner/Introduction_to_Ghidra_Student_Guide.html) describes CodeBrowser. Launch `ghidraRun`, create a non-shared project, import the owned target, confirm its format/language, open it and allow analysis. In the Symbol Tree, find the function named above; compare the Listing and Decompiler and save your addresses. Keep the project in a path without hidden components.

The released M1 cart has also opened in native CodeBrowser with its Listing and Decompiler visible. Selected API-driven navigation and font changes from 12 to 24 points and back were checked against actual window captures. Those checks do not establish physical keyboard/pane operation, VoiceOver, native browser/OS zoom or first-time human follow-along; these remain unverified. Earlier M1/M2 setup notes describe their original validation scope. Windows, Linux, Intel Mac, live-process debugging and other tool versions remain unsupported by these execution receipts.
