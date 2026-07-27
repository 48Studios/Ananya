'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowRight, FileText } from 'lucide-react';
import { navigationRegistry, NavGroup, NavGroupItem, NavSubItem } from '../../navigation/registry';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  title: string;
  category: string;
  href: string;
  icon?: React.ReactNode;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Flatten navigation items for quick search
  const searchableNavItems: SearchResult[] = [];
  navigationRegistry.forEach((group: NavGroup) => {
    group.items.forEach((item: NavGroupItem) => {
      if (item.href) {
        searchableNavItems.push({
          title: item.label,
          category: group.title,
          href: item.href,
          icon: item.icon,
        });
      }
      if (item.children) {
        item.children.forEach((sub: NavSubItem) => {
          searchableNavItems.push({
            title: `${item.label} → ${sub.label}`,
            category: group.title,
            href: sub.href,
            icon: item.icon,
          });
        });
      }
    });
  });

  const filteredResults = searchableNavItems.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredResults.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % (filteredResults.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          router.push(filteredResults[selectedIndex].href);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredResults, selectedIndex, router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette-modal" onClick={(e) => e.stopPropagation()}>
        <div className="command-search-header">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search pages, modules, transactions, or actions..."
            className="command-input"
            autoFocus
          />
          <button type="button" onClick={onClose} className="close-btn" aria-label="Close search">
            <X size={16} />
          </button>
        </div>

        <div className="command-results-list">
          {filteredResults.length === 0 ? (
            <div className="command-empty">No matching modules or actions found for &quot;{query}&quot;</div>
          ) : (
            filteredResults.map((result, idx) => (
              <div
                key={`${result.href}-${idx}`}
                className={`command-result-item ${idx === selectedIndex ? 'selected' : ''}`}
                onClick={() => {
                  router.push(result.href);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="result-left">
                  <span className="result-icon">{result.icon || <FileText size={16} />}</span>
                  <span className="result-title">{result.title}</span>
                </div>
                <div className="result-right">
                  <span className="result-category">{result.category}</span>
                  <ArrowRight size={14} className="result-arrow" />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="command-footer">
          <span className="key-hint"><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
          <span className="key-hint"><kbd>↵</kbd> Select</span>
          <span className="key-hint"><kbd>esc</kbd> Dismiss</span>
        </div>
      </div>
    </div>
  );
}
