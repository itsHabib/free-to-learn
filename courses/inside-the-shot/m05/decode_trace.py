#!/usr/bin/env python3
"""Feed the recorded real-process delivery chunks through your saved decoder."""
import argparse
from check_decoder import load as load_decoder
from view_trace import deliveries, load as load_trace


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decoder")
    parser.add_argument("trace")
    args = parser.parse_args()
    try:
        decoder = load_decoder(args.decoder)()
        for index, event in enumerate(deliveries(load_trace(args.trace)), 1):
            result = decoder.feed(bytes.fromhex(event["hex"]))
            print(f"delivery {index}, ending byte {event['offset'] + event['count']}: {result!r}")
        decoder.finish()
        print("EOF accepted: no incomplete frame remains.")
    except Exception as error:
        parser.exit(1, f"Decode refused: {type(error).__name__}: {error}\nPreserve this feedback; use a new Decoder for a new stream.\n")
