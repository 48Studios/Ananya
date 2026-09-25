# Ananya ML Model Evaluation Report — v1.7.0

**Evaluated At**: 2026-09-25T14:45:10.030949+00:00
**Samples Evaluated**: 1342
**Overall Status**: `FAILED (Blocked)`

## Primary Metrics
| Metric | Candidate | Baseline | Status |
| :--- | :--- | :--- | :--- |
| Top-1 Category Accuracy | 94.8% | 5.9% | PASS |
| Top-3 Category Accuracy | 99.1% | — | — |
| Duplicate Precision | 100.0% | 95.0% min | PASS |
| Duplicate Recall | 100.0% | 95.0% min | PASS |
| Critical False Merges | 0 | 0 allowed | PASS |
| Inference Latency (P95) | 1.37 ms | <= 5.0 ms | PASS |
| Peak Memory Footprint | 260.2 MB | <= 256 MB | FAIL |
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
| Cables | 0.970 | 0.970 | 0.970 | 165 |
| Capacitors | 0.850 | 1.000 | 0.919 | 17 |
| Connectors | 1.000 | 0.824 | 0.903 | 17 |
| Consumables | 1.000 | 1.000 | 1.000 | 22 |
| Development Boards | 0.781 | 0.939 | 0.853 | 114 |
| Fasteners | 1.000 | 1.000 | 1.000 | 3 |
| ICs & Semiconductors | 1.000 | 0.581 | 0.735 | 31 |
| Mechanical Parts | 1.000 | 0.821 | 0.901 | 39 |
| Optoelectronics | 0.935 | 0.953 | 0.944 | 106 |
| Passive Components | 0.000 | 0.000 | 0.000 | 3 |
| Relays | 1.000 | 1.000 | 1.000 | 4 |
| Resistors | 1.000 | 0.375 | 0.545 | 8 |
| Robotics | 0.941 | 0.928 | 0.934 | 69 |
| Sensors | 0.882 | 0.938 | 0.909 | 128 |
| Switches | 0.917 | 1.000 | 0.957 | 22 |
| Tools | 0.992 | 0.976 | 0.984 | 380 |
| Valves & Pneumatics | 1.000 | 1.000 | 1.000 | 27 |
