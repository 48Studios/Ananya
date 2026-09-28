# Ananya ML Model Evaluation Report — v1.8.0

**Evaluated At**: 2026-09-28T08:46:06.577232+00:00
**Samples Evaluated**: 1342
**Overall Status**: `FAILED (Blocked)`

## Primary Metrics
| Metric | Candidate | Baseline | Status |
| :--- | :--- | :--- | :--- |
| Top-1 Category Accuracy | 100.0% | 94.8% | PASS |
| Top-3 Category Accuracy | 100.0% | — | — |
| Duplicate Precision | 100.0% | 95.0% min | PASS |
| Duplicate Recall | 100.0% | 95.0% min | PASS |
| Critical False Merges | 0 | 0 allowed | PASS |
| Inference Latency (P95) | 1.64 ms | <= 5.0 ms | PASS |
| Peak Memory Footprint | 320.8 MB | <= 256 MB | FAIL |
| Unverified Records | 0 | 0 allowed | PASS |

## Quality Gate Summary
- **accuracy_gate**: ✅ PASSED
- **duplicate_precision_gate**: ✅ PASSED
- **duplicate_recall_gate**: ✅ PASSED
- **latency_gate**: ✅ PASSED
- **memory_gate**: ❌ FAILED
- **provenance_gate**: ✅ PASSED

## Per-Class Classification Metrics
| Class | Precision | Recall | F1-Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| 3D Printing Materials | 1.000 | 1.000 | 1.000 | 187 |
| Cables | 1.000 | 1.000 | 1.000 | 165 |
| Capacitors | 1.000 | 1.000 | 1.000 | 17 |
| Connectors | 1.000 | 1.000 | 1.000 | 17 |
| Consumables | 1.000 | 1.000 | 1.000 | 22 |
| Development Boards | 1.000 | 1.000 | 1.000 | 114 |
| Fasteners | 1.000 | 1.000 | 1.000 | 3 |
| ICs & Semiconductors | 1.000 | 1.000 | 1.000 | 31 |
| Mechanical Parts | 1.000 | 1.000 | 1.000 | 39 |
| Optoelectronics | 1.000 | 1.000 | 1.000 | 106 |
| Passive Components | 1.000 | 1.000 | 1.000 | 3 |
| Relays | 1.000 | 1.000 | 1.000 | 4 |
| Resistors | 1.000 | 1.000 | 1.000 | 8 |
| Robotics | 1.000 | 1.000 | 1.000 | 69 |
| Sensors | 1.000 | 1.000 | 1.000 | 128 |
| Switches | 1.000 | 1.000 | 1.000 | 22 |
| Tools | 1.000 | 1.000 | 1.000 | 380 |
| Valves & Pneumatics | 1.000 | 1.000 | 1.000 | 27 |
