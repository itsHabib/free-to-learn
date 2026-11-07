# Sensor completion feedback

Open this page after saving the three completion answers in [the worked example](worked-example.md). Keep the original record and record this feedback in `assistance_details`.

The values are reading **512**, drift **−32767** and width **2**. `00 02` means zero plus two times 256. `01 80` is unsigned 32769; its top bit is set, so subtracting 65536 gives −32767. The slice `[5:7]` contains positions 5 and 6 and excludes 7. If an answer differs, identify whether byte order, signed interpretation or slice width caused it before saving a repair.
