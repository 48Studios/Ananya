export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-6 py-3 text-xs text-muted-foreground">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <span>© {new Date().getFullYear()} 48 Studios. All rights reserved.</span>
          <span>•</span>
          <span>Ananya ERP v0.1.0-beta.4</span>
        </div>
        <div className="text-muted-foreground">
          Internal Operations Platform
        </div>
      </div>
    </footer>
  )
}
