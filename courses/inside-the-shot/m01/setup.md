# Tool setup for the cart investigation

The first target is a tiny command-line program. It does not need a VM, a kernel driver, a model service or an account. Use a computer for code editing and native inspection; the written lesson can be read on a phone.

## What is verified here

The author build and tests run on Apple Silicon macOS with Apple clang 21.0.0 and Python 3.14.6. The student bundle contains **Mach-O ARM64** executables for that platform. Do not run these binaries on Linux, Windows or an Intel Mac and assume an error is your model's fault. Those native targets have not been verified yet.

If you are on the verified Mac platform, extract the student bundle and open its START-HERE.md. No package download is needed to execute these three owned toy programs or use their Python checks. Inspect `manifest.json` for exact compiler, flags, source and executable hashes. Rebuild from the repository with `python3 courses/re-lab/tools/build.py`; the command prints a new build directory and does not replace earlier output. A build on another compiler/OS may differ and is an unverified target until tested. Matching behavior is not a claim of byte-identical builds across compilers.

## Ghidra path — documented, not yet exercised here

The reference version is **Ghidra 12.1.4**, using the official release and its version-pinned Getting Started guide. That guide calls for 64-bit JDK 21, at least 4 GB RAM and 1 GB storage for Ghidra itself, plus space for the archive, JDK, projects and caches. Python 3.9–3.14 applies to the listed integrations; our milestone uses Python for its own local checks. The moving development branch has different requirements, so do not use its JDK 25 instructions for this pinned release without checking its own guide.

When you have adequate disk space and are ready to install tools, follow the official release instructions and get the named release ZIP, not GitHub's source-code archive. Extract into a new directory. Launch `ghidraRun` (Windows: `ghidraRun.bat`), create a non-shared project, then use File → Import File on `cart`. Confirm the format and architecture agree with the manifest. Open it in CodeBrowser and allow analysis; find `lab_step` in the Symbol Tree. Compare the Listing with the Decompiler, treating recovered names/types as hypotheses. Save addresses and the actual Ghidra version with your observations.

If import or native-component launch fails, preserve the error and use the supplied assembly listing for the bounded static-analysis route. Do not disable OS protections or change security settings as part of this lesson. The assembly route teaches the same evidence question, but it does not establish that Ghidra works on your system.

No Ghidra or JDK was installed during this build because the shared machine is under a disk-headroom hold. GUI import, decompilation, screenshots, Linux/Windows execution and screen-reader use remain **unverified**. Installed command-line Java was absent. This is a concrete tool-validation gap, not a passed step.

## Reference links

- [Ghidra 12.1.4 release](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build)
- [Version-pinned Getting Started guide](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_12.1.4_build/GhidraDocs/GettingStarted.md)
- [Official introductory student guide](https://github.com/NationalSecurityAgency/ghidra/blob/Ghidra_12.1.4_build/GhidraDocs/GhidraClass/Beginner/Introduction_to_Ghidra_Student_Guide.html)

These are references. This repository does not redistribute Ghidra, its documentation, book pages or other people's training binaries.
