import Link from 'next/link';
import { JsonLd } from './JsonLd';
import { createBreadcrumbSchema } from '@/lib/seo/structured-data';

interface BreadcrumbItem {
  name: string;
  path: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const allItems = [{ name: 'Home', path: '/' }, ...items];

  return (
    <>
      <JsonLd data={createBreadcrumbSchema(allItems)} />
      <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
        <ol className="flex items-center gap-2">
          {allItems.map((item, index) => (
            <li key={item.path} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {index === allItems.length - 1 ? (
                <span className="text-neutral-900" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.path}
                  className="hover:text-neutral-900 transition-colors"
                >
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
