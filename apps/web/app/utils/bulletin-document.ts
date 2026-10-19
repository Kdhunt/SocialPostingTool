/** What the newsletter renderer (components/bulletin/BulletinDocument.vue) draws. */
export interface BulletinDocumentSection {
  key: string;
  organizationName: string | null;
  column: 'Main' | 'Side';
  sortOrder: number;
  heading: string;
  subheading: string | null;
  bodyHtml: string;
  imageUrl: string | null;
  imageAltText: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
}

export interface BulletinDocumentModel {
  title: string;
  kicker: string | null;
  issueDate: string;
  language: string;
  template: 'Newsletter' | 'SingleColumn';
  sections: BulletinDocumentSection[];
}
