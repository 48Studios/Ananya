'use client'

import * as React from 'react'
import Link from 'next/link'
import { FavoriteDto, preferencesApi } from '@/lib/api/preferences-api'
import { Bookmark, Star, Trash2 } from 'lucide-react'

export interface FavoritesPanelProps {
  favorites: FavoriteDto[]
  onFavoriteRemoved?: () => void
}

export function FavoritesPanel({ favorites, onFavoriteRemoved }: FavoritesPanelProps) {
  const [items, setItems] = React.useState<FavoriteDto[]>(favorites)

  React.useEffect(() => {
    setItems(favorites)
  }, [favorites])

  const handleRemove = async (id: string) => {
    try {
      await preferencesApi.removeFavorite(id)
      setItems((prev) => prev.filter((f) => f.id !== id))
      if (onFavoriteRemoved) onFavoriteRemoved()
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-4 bg-card border border-border rounded-xl shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          <h3 className="text-xs font-bold text-foreground">Pinned & Favorite Records</h3>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
          No pinned records. Star items across modules for instant access.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-2.5 bg-muted/20 border border-border rounded-lg flex items-center justify-between gap-2 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Bookmark className="w-3.5 h-3.5 text-primary shrink-0" />
                <Link href={item.href} className="text-xs font-semibold text-foreground hover:underline truncate">
                  {item.title}
                </Link>
                <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-muted text-muted-foreground rounded">
                  {item.entityType}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                title="Unpin Favorite"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
