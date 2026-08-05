# Ananya ERP - Enterprise Application Shell

A modern, premium enterprise resource planning (ERP) application shell built with Next.js 16, React 19, Tailwind CSS, and shadcn/ui. This foundation provides a production-quality layout and navigation system designed for scalable, enterprise-grade applications.

## 🎯 Design Philosophy

The Ananya ERP shell follows a **content-first, minimal** design philosophy comparable to Linear, Notion, and Vercel:

- **Spacious & Minimal**: Whitespace creates hierarchy, not borders
- **Premium Aesthetic**: Clean typography, subtle cards, smooth interactions
- **Enterprise-Ready**: Professional navigation, responsive design, accessibility-first
- **Dark Mode Support**: Full theme support with seamless transitions
- **Performance-Optimized**: Built with modern React and Next.js patterns

## 🏗️ Architecture

### Directory Structure

```
app/
├── layout.tsx              # Root layout with theme provider
├── page.tsx                # Redirects to /dashboard
├── globals.css             # Design tokens and theme system
├── dashboard/
│   └── page.tsx            # Main dashboard page
└── inventory/
    └── page.tsx            # Inventory management example page

components/
├── dashboard-layout.tsx    # Main layout wrapper
├── sidebar.tsx             # Collapsible navigation with nested menus
├── header.tsx              # Top bar with search, theme, notifications
├── footer.tsx              # Footer information
└── theme-provider.tsx      # Next-themes integration
```

### Core Components

#### DashboardLayout

Reusable wrapper that provides:

- Sidebar navigation
- Sticky header
- Main content area with max-width
- Footer

Every page should use this component:

```tsx
import { DashboardLayout } from "@/components/dashboard-layout";

export default function Page() {
  return <DashboardLayout>{/* Your content here */}</DashboardLayout>;
}
```

#### Sidebar

Features:

- Compact mode (auto-collapses on desktop)
- Nested navigation with expand/collapse
- Active indicator on current route
- Mobile drawer with overlay
- Persistent collapse state
- Smooth animations

#### Header

Contains:

- Dynamic breadcrumb from current route
- Global search input
- Theme toggle (Light/Dark)
- Notifications badge
- User menu dropdown

#### Footer

Displays:

- Copyright and version info
- Environment status

## 🎨 Design System

### Color Palette

**Light Mode:**

- Background: `#fafaf8` (warm white)
- Foreground: `#1a1a18` (dark gray)
- Primary: `#1a1a18` (black)
- Accent (sidebar): `#4ade80` (green)
- Borders: `#e8e8e6` (light gray)

**Dark Mode:**

- Background: `#0f0f0e` (near black)
- Foreground: `#fafaf8` (off white)
- Primary: `#fafaf8` (white)
- Accent (sidebar): `#4ade80` (green) - maintains consistency
- Borders: `#2a2a28` (dark gray)

### Typography

- **Headings**: Bold, clear hierarchy
- **Body**: Regular weight, balanced line height
- **Muted**: Gray tone for secondary information
- **Code-friendly**: Monospace for technical content

### Spacing & Radius

- Base radius: `0.5rem` (8px)
- Padding standard: 6 (24px), 8 (32px)
- Gap standard: 4 (16px), 6 (24px)

## 🚀 Getting Started

### Installation

```bash
# Clone or create the project
git clone <repo-url>
cd ananya-erp

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Creating New Pages

1. Create a new directory under `app/`
2. Add a `page.tsx` file
3. Wrap content in `DashboardLayout`:

```tsx
"use client";

import { DashboardLayout } from "@/components/dashboard-layout";

export default function FeaturePage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Feature Title</h1>
        {/* Your content */}
      </div>
    </DashboardLayout>
  );
}
```

### Adding Navigation Items

Edit `components/sidebar.tsx` and add to the `navItems` array:

```tsx
{
  label: 'My Feature',
  href: '/my-feature',
  icon: <IconComponent className="w-4 h-4" />,
  children: [
    // Optional nested items
    { label: 'Sub Item', href: '/my-feature/sub', icon: <Icon /> },
  ],
}
```

## 🎯 Responsive Behavior

- **Desktop (≥768px)**: Permanent collapsible sidebar
- **Tablet (768px)**: Collapsible sidebar with hover expand
- **Mobile (<768px)**: Drawer navigation hidden by default

## 🌙 Theme Support

The app uses `next-themes` for seamless theme switching:

```tsx
import { useTheme } from "next-themes";

export function MyComponent() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Toggle Theme
    </button>
  );
}
```

## 📦 Dependencies

- **next**: 16.2.6 - React framework
- **react**: 19.x - UI library
- **shadcn/ui**: Component library
- **tailwindcss**: 4.3.3 - Utility CSS
- **lucide-react**: Icons
- **next-themes**: Theme management

## 🔒 Accessibility

- Semantic HTML throughout
- ARIA labels and roles
- Keyboard navigation support
- Screen reader friendly
- High contrast in both themes

## 🚀 Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN pnpm install
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
```

## 📝 Development Guidelines

### Component Patterns

- Use Server Components by default
- Mark interactive components with `'use client'`
- Follow shadcn/ui patterns for consistency
- Keep components modular and reusable

### Styling

- Use Tailwind utility classes
- Reference design tokens in `globals.css`
- Avoid arbitrary values when possible
- Use semantic color variables

### State Management

For simple state: Use React `useState`
For complex state: Consider Context API or external state management

## 🧪 Testing

Recommended testing stack:

- **Jest** for unit tests
- **Playwright** for e2e tests
- **React Testing Library** for component tests

## 📚 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Lucide Icons](https://lucide.dev)

## 📄 License

This project is provided as-is for enterprise development.

## 🎓 Next Steps

1. **Add Authentication**: Integrate with Better Auth or Supabase
2. **Database**: Connect to PostgreSQL or similar
3. **API Routes**: Add backend endpoints
4. **Dashboard Analytics**: Implement real-time charts
5. **User Management**: Build admin panel
6. **Data Tables**: Add advanced table features (sorting, filtering, pagination)
7. **Forms**: Create complex form builders
8. **Reports**: Implement report generation

---

**Version**: 1.0.0  
**Environment**: Production  
**Last Updated**: 2024
