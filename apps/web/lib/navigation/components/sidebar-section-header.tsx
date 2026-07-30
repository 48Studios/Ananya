'use client'

import React from 'react'
import { NAV_TOKENS } from '../tokens'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  className?: string
}

export function SectionHeader({ title, className }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        NAV_TOKENS.ITEM_HEIGHT_CHILD,
        NAV_TOKENS.LEVEL_1_PADDING,
        'flex items-center text-[10px] font-semibold text-muted-foreground/75 uppercase tracking-widest shrink-0 select-none',
        className
      )}
    >
      {title}
    </div>
  )
}
