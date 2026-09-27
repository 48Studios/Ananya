Pure data store with no executable code — the module is a flat filesystem layout consumed by other ML services.

- `registry/<version>/` holds immutable per-version artifacts: `category_classifier.pkl` (pickled scikit-learn model), `metadata.json` (training metrics, candidate models, per-category report), `evaluation_report.json`, and optional `pipeline_summary.json` / `evaluation_summary.md`. Versions follow semantic-style tags (`v1.1.0` … `v1.7.1`) plus dataset-scoped entries like `vdataset-crawl-1790258177-baseline`.
- `registry/active_deployment.json` is the single source of truth for promotion: it points at one active version, records `sourceArtifact`, `productionPath`, `backupPath`, `artifactSha256`, `deployedAt`, and `qualityGatesPassed`.
- The top-level `category_classifier.pkl` and `category_classifier.pkl.backup` are the live production artifact and its previous deployment snapshot, mirroring the paths declared in `active_deployment.json`.
- `model_metadata.json` is a copy of the active deployment manifest used as a read-only contract for consumers.
- `category_knowledge.json` and `manufacturer_knowledge.json` define the static taxonomy (categories with aliases, regex patterns, parent hierarchy) that the classifier targets.

Dependency direction is one-way: runtime code reads these files; nothing inside this scope imports from elsewhere.