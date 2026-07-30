'use client'

import * as React from 'react'
import { ArrowUpRight } from "lucide-react";
import { cn } from '@/lib/utils'

export interface ExternalLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children?: React.ReactNode
  hideIcon?: boolean
  iconClassName?: string
}

export function ExternalLink({
  href,
  children,
  hideIcon = false,
  className,
  iconClassName,
  ...props
}: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 hover:text-foreground transition-colors',
        className
      )}
      {...props}
    >
      {children}
      {!hideIcon && (
        <ArrowUpRight
          aria-hidden="true"
          className={cn('size-3.5 shrink-0', iconClassName)}
        />
      )}
    </a>
  )
}
