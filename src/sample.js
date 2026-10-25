export const SAMPLE = `# Hearth & Crumb

A neighbourhood bakery baking sourdough, pastries and slow coffee since 2014.

![Fresh loaves on the counter](https://picsum.photos/seed/hearth-hero/1400/1000)

[Order for pickup](https://example.com/order) [See the menu](#menu)

## Our story

We started with one oven, one starter named Gus, and a stubborn belief that good bread takes time. Ten years later the oven is bigger, Gus is still alive, and we still shape every loaf by hand.

![Baker shaping dough](https://picsum.photos/seed/hearth-baker/1200/900)

Everything is baked on site each morning from organic, stone-milled flour.

## What we bake {cards}

### Sourdough
A 36-hour ferment, a blistered crust and an open, tender crumb.

### Viennoiserie
Croissants and kouign-amann laminated with cultured French butter.

### Seasonal cakes
Whatever the market gives us: rhubarb in spring, plums in autumn.

## By the numbers

- **10** years baking
- **400+** loaves a day
- **36h** ferment on every sourdough
- **1** very old starter

## From the oven

![Croissants](https://picsum.photos/seed/hearth-1/900/700)
![Bread basket](https://picsum.photos/seed/hearth-2/900/700)
![Coffee](https://picsum.photos/seed/hearth-3/900/700)
![Cake](https://picsum.photos/seed/hearth-4/900/700)
![Counter](https://picsum.photos/seed/hearth-5/900/700)

## Bread club {pricing}

Fresh bread every week, picked up or delivered.

### Weekly loaf — $12 / week
- One sourdough of your choice
- Pickup Saturday morning

[Join](https://example.com/join)

### Family — $28 / week (Most popular)
- Two loaves + six pastries
- Free local delivery

[Join](https://example.com/join)

### Café partner — $90 / week
- Wholesale bread for your café
- Daily delivery

[Get in touch](mailto:hello@hearthandcrumb.com)

## Opening hours

| Day | Hours | Notes |
| --- | :---: | --- |
| Mon–Fri | 7:00–17:00 | Pastries sell out by noon |
| Saturday | 8:00–15:00 | Bread club pickup |
| Sunday | Closed | |

## What people say

> The best croissant I've had outside Paris. I plan my weekends around this place.
> — Maya R.

> Their sourdough ruined supermarket bread for me forever.
> — Tom & Priya

## Frequently asked

### Do you have gluten-free options?
Yes — a buckwheat loaf on Fridays and flourless chocolate cake every day.

### Can I order a custom cake?
Absolutely. Give us 72 hours' notice and tell us what you're celebrating.

### Do you sell starter?
We give it away. Bring a jar.

## Visit us

12 Mill Lane, Riverside
Open Tue–Sun, 7am – 3pm

hello@hearthandcrumb.com

[Get directions](https://maps.google.com) [Instagram](https://instagram.com)
`;

export const CHEATSHEET = `How your text becomes a website

# Title           → site name (first line)
First paragraph   → tagline
![alt](url)       → image (first one becomes the hero)
[Text](url)       → a line of only links becomes buttons
## Section        → a new page section + nav item

Each section's layout is picked from its content:
• 3+ images, little text      → gallery
• 1 image + text              → image beside text
• 2+ ### sub-headings         → cards
• ### headings ending in "?"  → FAQ
• ### with prices ($, €, £)   → pricing
• list of "**Name** — text"   → cards
• list starting with numbers  → stats
• list starting with years    → timeline
• > quotes                    → testimonials
• "Contact" or an email       → contact card
• only links                  → call-to-action band
• | pipe | tables |          → styled table (any section)

Force a layout: ## My section {gallery}
Layouts: prose split gallery cards listCards pricing faq stats timeline testimonials contact cta

Colors, fonts, corners, buttons and layout can be changed in the Style panel
(top bar → Style). The same settings also work at the very top of the text:
---
palette: Midnight   (Paper Sage Porcelain Blush Sunny Lilac Mono Midnight Forest Ember Ink Ocean)
font: Sora          (Fraunces Playfair Space DM Syne Bricolage Cormorant Instrument Sora Lora Archivo)
hero: banner        (centered split banner bigtype)
mode: dark          (dark light)
accent: #ff5a36
radius: 12          (0–48, in px)
buttons: pill       (square rounded pill)
cards: elevated     (outlined filled elevated)
rhythm: lines       (alternate lines plain)
align: center       (left center)
nav: pill           (bar pill)
numbers: off        (on off)
spacing: airy       (compact normal airy)
scale: 1.333        (1.2 1.25 1.333)
---
The Style panel wins over these when both are set.`;
