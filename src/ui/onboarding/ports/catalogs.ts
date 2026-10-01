import type { CatalogFilter, Hire, Page, Position, Roadmap, TemplateTree } from '../domain/models';

export interface Catalogs {
  positions(filter: CatalogFilter, cursor?: string, order?: 'updated-desc'): Promise<Page<Position>>;
  hires(filter: CatalogFilter, cursor?: string): Promise<Page<Hire>>;
  position(id: string): Promise<Position>;
  hire(id: string): Promise<Hire>;
  template(listId: string): Promise<TemplateTree>;
  roadmap(listId: string): Promise<Roadmap>;
}
