# New Package Checklist

## Workspace

- [ ] Added to pnpm-workspace.yaml
- [ ] package.json created
- [ ] Correct package name
- [ ] Version defined
- [ ] Explicitly declares dependencies on all consumed internal packages (no implicit hoisting)

## TypeScript

- [ ] Extends @ananya/typescript-config
- [ ] Uses repository standard
- [ ] check-types passes

## Quality

- [ ] Lint passes
- [ ] Build passes
- [ ] Tests added (if applicable)

## Package

- [ ] Public API defined
- [ ] index.ts exports reviewed
- [ ] No unnecessary exports

## Documentation

- [ ] README updated (if needed)
- [ ] Architecture updated (if needed)
