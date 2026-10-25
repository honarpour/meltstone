// Decides how each section should be laid out, purely from its shape.
// Order matters: the most specific signals are checked first.

import { allBlocks, imagesIn, plainText } from './parser.js';

const STAT_RE = /^\**\s*[~≈]?[$€£¥]?\d[\d.,]*\s*[%+kKmMbBx×]*\+?\**\s*(?:[—–:-]\s*)?\S/;
const DATE_RE = /^\**\s*((?:19|20)\d{2}(?:\s*[–—-]\s*(?:(?:19|20)\d{2}|present|now|today))?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2})\**\s*[—–:-]/i;
const TITLED_ITEM_RE = /^\*\*([^*]+)\*\*\s*(?:[—–:-]\s*)?(.+)$/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;

export const KIND_LABELS = {
  prose: 'Text', split: 'Image + text', gallery: 'Gallery', cards: 'Cards',
  listCards: 'Cards', pricing: 'Pricing', faq: 'FAQ', stats: 'Stats',
  timeline: 'Timeline', testimonials: 'Testimonials', contact: 'Contact', cta: 'Call to action',
};

export function classify(section) {
  if (section.meta && section.meta.layout && KIND_LABELS[section.meta.layout]) return section.meta.layout;

  const title = section.title.toLowerCase();
  const blocks = allBlocks(section);
  const subs = section.subsections;
  const images = imagesIn(blocks);
  const lists = blocks.filter(b => b.type === 'list');
  const listItems = lists.flatMap(l => l.items);
  const quotes = blocks.filter(b => b.type === 'quote');
  const textLen = blocks.filter(b => b.type === 'para').reduce((n, b) => n + plainText(b.text).length, 0);
  const onlyLinks = blocks.length > 0 && blocks.every(b => b.type === 'links' || b.type === 'para');
  const raw = blocks.map(b => b.text || (b.items || []).join(' ')).join(' ');

  if (/contact|get in touch|reach (us|me|out)|say hello|find us|visit us|hire/.test(title) ||
      (EMAIL_RE.test(raw) && blocks.length <= 3 && !subs.length)) return 'contact';

  if (subs.length >= 2 && (/faq|question/.test(title) || subs.every(s => s.title.trim().endsWith('?')))) return 'faq';

  if (subs.length >= 2 && (/pricing|plans|packages|rates|tiers/.test(title) ||
      subs.filter(s => /[$€£¥]\s?\d/.test(s.title + ' ' + s.blocks.map(b => b.text || '').join(' '))).length >= 2)) return 'pricing';

  if (quotes.length && quotes.length >= blocks.length - 1) return 'testimonials';
  if (/testimonial|what people say|reviews|kind words|praise/.test(title) && quotes.length) return 'testimonials';

  if (images.length >= 3 && textLen < 280 && !subs.length) return 'gallery';
  if (/gallery|photos|portfolio|showcase/.test(title) && images.length >= 2 && !subs.length) return 'gallery';


  if (listItems.length >= 2 && listItems.filter(t => DATE_RE.test(t)).length >= Math.ceil(listItems.length * 0.75)) return 'timeline';
  if (subs.length >= 2 && subs.every(s => DATE_RE.test(s.title + ' —'))) return 'timeline';

  if (listItems.length >= 2 && listItems.length <= 8 && lists.length === 1 && listItems.every(t => STAT_RE.test(t)) &&
      listItems.every(t => plainText(t).length < 60)) return 'stats';

  if (subs.length >= 2) return 'cards';

  if (listItems.length >= 2 && listItems.length <= 12 && listItems.every(t => TITLED_ITEM_RE.test(t))) return 'listCards';

  if (blocks.length && blocks.every(b => b.type === 'links')) return 'cta';
  if (onlyLinks && blocks.some(b => b.type === 'links') && textLen < 220) return 'cta';

  if (images.length === 1 && textLen > 0) return 'split';
  if (images.length >= 2 && textLen < 600) return 'gallery';

  return 'prose';
}

export { TITLED_ITEM_RE, DATE_RE, EMAIL_RE, PHONE_RE };
