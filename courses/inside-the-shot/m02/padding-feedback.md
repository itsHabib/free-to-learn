# Sensor padding feedback

Open this page after saving the padding prediction in [the worked example](worked-example.md). Keep the original record and record this feedback in `assistance_details`.

The comparison prints `True`: the decoder's slices never read the padding. A different padding pattern therefore cannot change a decoded field. This does not license ignoring a byte merely because one observation showed zero; the format or native evidence must establish that the byte is outside the fields.
