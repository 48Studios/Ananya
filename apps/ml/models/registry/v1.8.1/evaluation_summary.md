# Ananya ML Model Evaluation Report — v1.8.1

**Evaluated At**: 2026-09-28T10:31:03.106320+00:00
**Samples Evaluated**: 1409
**Overall Status**: `PASSED (Eligible for Promotion)`

## Primary Metrics
| Metric | Candidate | Baseline | Status |
| :--- | :--- | :--- | :--- |
| Top-1 Category Accuracy | 98.4% | 98.4% | PASS |
| Top-3 Category Accuracy | 99.9% | — | — |
| Duplicate Precision | 100.0% | 95.0% min | PASS |
| Duplicate Recall | 100.0% | 95.0% min | PASS |
| Critical False Merges | 0 | 0 allowed | PASS |
| Inference Latency (P95) | 0.72 ms | <= 5.0 ms | PASS |
| Peak Memory Footprint | 154.2 MB | <= 256 MB | PASS |
| Unverified Records | 0 | 0 allowed | PASS |

## Quality Gate Summary
- **accuracy_gate**: ✅ PASSED
- **duplicate_precision_gate**: ✅ PASSED
- **duplicate_recall_gate**: ✅ PASSED
- **latency_gate**: ✅ PASSED
- **memory_gate**: ✅ PASSED
- **provenance_gate**: ✅ PASSED

## Per-Class Classification Metrics
| Class | Precision | Recall | F1-Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| 3D Printing Materials | 1.000 | 1.000 | 1.000 | 200 |
| Cables | 0.974 | 0.987 | 0.980 | 149 |
| Capacitors | 1.000 | 1.000 | 1.000 | 8 |
| Connectors | 1.000 | 0.889 | 0.941 | 36 |
| Consumables | 1.000 | 1.000 | 1.000 | 16 |
| Development Boards | 0.965 | 0.979 | 0.972 | 140 |
| Fasteners | 1.000 | 1.000 | 1.000 | 9 |
| ICs & Semiconductors | 1.000 | 0.861 | 0.925 | 36 |
| Mechanical Parts | 1.000 | 1.000 | 1.000 | 33 |
| Optoelectronics | 0.987 | 1.000 | 0.993 | 74 |
| Passive Components | 1.000 | 1.000 | 1.000 | 2 |
| Relays | 1.000 | 1.000 | 1.000 | 3 |
| Resistors | 1.000 | 0.909 | 0.952 | 11 |
| Robotics | 1.000 | 0.971 | 0.985 | 69 |
| Sensors | 0.964 | 0.979 | 0.971 | 189 |
| Switches | 1.000 | 1.000 | 1.000 | 21 |
| Tools | 0.995 | 0.997 | 0.996 | 388 |
| Transistors | 1.000 | 1.000 | 1.000 | 5 |
| Valves & Pneumatics | 0.870 | 1.000 | 0.930 | 20 |
