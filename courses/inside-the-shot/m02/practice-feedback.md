# Sensor practice feedback

Open this page after saving the new sensor-record prediction and malformed-input decision in [the worked example](worked-example.md). Keep the original record and record this feedback in `assistance_details`.

The dictionary is `{'channel': 9, 'reading': 255, 'drift': -32768}`. Channel uses the first byte. Reading uses `ff 00`. Drift uses `00 80`, whose signed interpretation is −32768. The two padding bytes are not fields.

All three invalid inputs raise `ValueError`: one is short, one is long, and one is text rather than bytes. An early type and exact-length check prevents a short slice from being silently interpreted as a complete field.
