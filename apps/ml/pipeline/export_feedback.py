#!/usr/bin/env python3
"""
Feedback Dataset Exporter (RFC-0057)
Generates labeled training and evaluation datasets from confirmed inventory and AI feedback.
"""

import json
import os
import argparse
from typing import List, Dict, Any

SEED_TRAINING_DATA = [
    # Resistors
    {"text": "10k ohm 0805 smd resistor precision 1% yageo", "category": "Resistors"},
    {"text": "RC0805FR-0710KL 10k resistor", "category": "Resistors"},
    {"text": "100k ohm 5% 0603 resistor", "category": "Resistors"},
    {"text": "4.7k ohm 1/4W through hole metal film resistor", "category": "Resistors"},
    {"text": "0.1 ohm current sense resistor 2512 1W", "category": "Resistors"},
    {"text": "CRCW0805100KFKEA 100k resistor 1% vishay", "category": "Resistors"},
    {"text": "1k ohm pullup resistor smd 0402", "category": "Resistors"},
    {"text": "330 ohm current limiting resistor", "category": "Resistors"},
    # Capacitors
    {"text": "10uf 16v x7r 0805 ceramic capacitor murata", "category": "Capacitors"},
    {"text": "GRM21BR61A226ME51L 22uF 10V capacitor", "category": "Capacitors"},
    {"text": "100nF 50V X7R 0603 ceramic chip capacitor", "category": "Capacitors"},
    {"text": "100uF 25V electrolytic radial capacitor", "category": "Capacitors"},
    {"text": "C0805C105K8RACTU 1uF 10V KEMET ceramic capacitor", "category": "Capacitors"},
    {"text": "22pF 50V C0G 0402 crystal oscillator load capacitor", "category": "Capacitors"},
    {"text": "47uF 16V SMD aluminum electrolytic capacitor", "category": "Capacitors"},
    {"text": "10uF 35V tantalum capacitor case B", "category": "Capacitors"},
    # Inductors
    {"text": "10uH shielded power inductor 2A sunlord", "category": "Inductors"},
    {"text": "SWPA4020S100MT 10uH SMD inductor", "category": "Inductors"},
    {"text": "100uH toroidal wirewound inductor", "category": "Inductors"},
    {"text": "2.2uH high current power choke 0805", "category": "Inductors"},
    {"text": "ferrite bead 120 ohm 100MHz 0805 BLM21PG121SN1D", "category": "Inductors"},
    # Diodes
    {"text": "1N4148 high speed switching diode sod-123", "category": "Diodes"},
    {"text": "1N5819 1A 40V schottky barrier rectifier diode", "category": "Diodes"},
    {"text": "SS34 3A 40V surface mount schottky diode", "category": "Diodes"},
    {"text": "BZX84C5V1 5.1V 350mW zener diode SOT-23", "category": "Diodes"},
    {"text": "SMBJ5.0A transient voltage suppressor TVS diode", "category": "Diodes"},
    # Transistors
    {"text": "BSS138 n-channel logic level mosfet sot-23", "category": "Transistors"},
    {"text": "2N3904 general purpose NPN bipolar transistor", "category": "Transistors"},
    {"text": "SI2302DS 20V 2.8A N-channel MOSFET SOT-23", "category": "Transistors"},
    {"text": "BC847B general purpose transistor NPN SOT-23", "category": "Transistors"},
    {"text": "AO3401A P-channel enhancement mode mosfet", "category": "Transistors"},
    # Connectors
    {"text": "JST-XH 2.54mm 4-pin right angle header connector", "category": "Connectors"},
    {"text": "USB Type-C 16-pin female receptacle connector", "category": "Connectors"},
    {"text": "RJ45 8P8C modular jack ethernet connector with magnetics", "category": "Connectors"},
    {"text": "2.54mm pitch 40-pin breakable single row male pin header", "category": "Connectors"},
    {"text": "terminal block 2-pin 5.08mm screw connection", "category": "Connectors"},
    # ICs & Semiconductors
    {"text": "NE5532 low-noise dual operational amplifier dip-8", "category": "ICs & Semiconductors"},
    {"text": "STM32F407VGT6 ARM Cortex-M4 32-bit MCU 1MB flash", "category": "ICs & Semiconductors"},
    {"text": "LM7805 5V 1A positive linear voltage regulator TO-220", "category": "ICs & Semiconductors"},
    {"text": "AMS1117-3.3V 1A low dropout LDO voltage regulator SOT-223", "category": "ICs & Semiconductors"},
    {"text": "ATmega328P-AU 8-bit AVR microcontroller TQFP-32", "category": "ICs & Semiconductors"},
    {"text": "MAX485 RS-485/RS-422 transceiver IC SOIC-8", "category": "ICs & Semiconductors"},
    # Switches
    {"text": "6x6mm momentary tactile push button switch 4.3mm", "category": "Switches"},
    {"text": "SPDT sub-miniature toggle switch 3-pin panel mount", "category": "Switches"},
    {"text": "slide switch 3-position vertical PCB mount", "category": "Switches"},
    {"text": "4-position SMD DIP switch 2.54mm pitch", "category": "Switches"},
    # Optoelectronics
    {"text": "3mm diffused red LED indicator 20mA through hole", "category": "Optoelectronics"},
    {"text": "0805 SMD green LED 570nm 20mA clear lens", "category": "Optoelectronics"},
    {"text": "PC817 4-pin phototransistor optocoupler DIP-4", "category": "Optoelectronics"},
    # Cables
    {"text": "24 AWG stranded copper hook-up wire black 100m spool", "category": "Cables"},
    {"text": "shielded USB 2.0 cable assembly Type-A to Type-C 1m", "category": "Cables"},
    {"text": "10-conductor ribbon cable 1.27mm pitch gray", "category": "Cables"},
    # Mechanical Parts
    {"text": "M3x8mm stainless steel socket head cap screw hex drive", "category": "Mechanical Parts"},
    {"text": "M3 hex brass standoff spacer male female 15mm", "category": "Mechanical Parts"},
    {"text": "extruded aluminum heatsink 25x25x10mm for TO-220", "category": "Mechanical Parts"},
    # Raw Materials
    {"text": "FR-4 double sided copper clad laminate board 1.6mm", "category": "Raw Materials"},
    {"text": "thermal silicone paste compound 30g syringe", "category": "Raw Materials"},
    # Consumables
    {"text": "lead-free solder wire SAC305 0.8mm flux core 500g", "category": "Consumables"},
    {"text": "no-clean rosin soldering flux pen 10ml", "category": "Consumables"},
    {"text": "heat shrink tubing 3:1 dual wall adhesive lined 6mm", "category": "Consumables"},
]

def export_dataset(
    feedback_file: str = "",
    output_file: str = "apps/ml/data/training_dataset.json",
) -> List[Dict[str, Any]]:
    dataset = list(SEED_TRAINING_DATA)

    # Ingest external feedback if provided
    if feedback_file and os.path.exists(feedback_file):
        with open(feedback_file, "r") as f:
            feedback_records = json.load(f)
            for rec in feedback_records:
                if rec.get("suggestionType") == "CATEGORY" and rec.get("userAction") in ("ACCEPTED", "EDITED"):
                    val = rec.get("finalValue") or rec.get("predictedValue")
                    ctx = rec.get("creationContext") or {}
                    text = f"{ctx.get('sku', '')} {ctx.get('name', '')} {ctx.get('description', '')}".strip()
                    cat = val.get("subcategoryName") or val.get("categoryName") if isinstance(val, dict) else str(val)
                    if text and cat:
                        dataset.append({"text": text, "category": cat, "source": "feedback"})

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w") as f:
        json.dump(dataset, f, indent=2)

    print(f"Exported {len(dataset)} labeled records to {output_file}")
    return dataset

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export feedback dataset for Ananya ML")
    parser.add_argument("--feedback-file", default="", help="Path to raw feedback JSON")
    parser.add_argument("--output", default="apps/ml/data/training_dataset.json", help="Output path")
    args = parser.parse_args()
    export_dataset(args.feedback_file, args.output)
