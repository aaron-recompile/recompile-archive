// JSON-LD builders.
//
// Every concept that resolves to a Wikidata entity is linked with sameAs, so a
// retrieval system gets a deterministic identifier instead of a string it has
// to disambiguate. QIDs below were verified against the live Wikidata API on
// 2026-09-19; do not add one without checking it.

import type { ArticleWithSeries, Series } from "./api";
import { SITE_URL } from "./server-api";

const WIKIDATA = {
  bitcoin: "Q131723",
  bitcoinScript: "Q96472816",
  taproot: "Q107377077",
  schnorr: "Q1465057",
  segwit: "Q30327698",
  bitcoinCore: "Q18198917",
  cryptography: "Q8789",
  hashTree: "Q14746",
} as const;

const thing = (name: string, qid?: string) => ({
  "@type": "Thing",
  name,
  ...(qid ? { sameAs: `https://www.wikidata.org/wiki/${qid}` } : {}),
});

export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** Person + WebSite, rendered once in the root layout. */
export function siteGraph(seriesCount: number, articleCount: number) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: "Aaron Zhang",
        alternateName: "Aaron Recompile",
        jobTitle: "Bitcoin Layer 1 Protocol Engineer",
        description:
          "Bitcoin protocol engineer working on Taproot and RGB. OpenSats grantee. Author of Mastering Taproot.",
        url: `${SITE_URL}/`,
        sameAs: ["https://github.com/aaron-recompile"],
        knowsAbout: [
          thing("Bitcoin", WIKIDATA.bitcoin),
          thing("Taproot", WIKIDATA.taproot),
          thing("Bitcoin Script", WIKIDATA.bitcoinScript),
          thing("Schnorr digital signature scheme", WIKIDATA.schnorr),
          thing("SegWit", WIKIDATA.segwit),
          thing("Bitcoin Core", WIKIDATA.bitcoinCore),
          thing("Cryptography", WIKIDATA.cryptography),
          thing("Merkle tree", WIKIDATA.hashTree),
        ],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: "Recompile Archive",
        url: `${SITE_URL}/`,
        description: `Engineering references on Bitcoin Script, Taproot and OP_* opcodes: ${articleCount} articles in ${seriesCount} series, each derived from a transaction executed on Signet.`,
        inLanguage: "en",
        author: { "@id": PERSON_ID },
        publisher: { "@id": PERSON_ID },
        audience: {
          "@type": "Audience",
          audienceType:
            "Bitcoin protocol developers, Script engineers, wallet and Layer 2 engineers",
        },
      },
    ],
  };
}

/** TechArticle for one article page. */
export function articleGraph(a: ArticleWithSeries) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${SITE_URL}/articles/${a.id}#article`,
    headline: a.title,
    ...(a.subtitle ? { description: a.subtitle } : {}),
    url: `${SITE_URL}/articles/${a.id}`,
    ...(a.published_at ? { datePublished: a.published_at.slice(0, 10) } : {}),
    inLanguage: "en",
    proficiencyLevel: "Expert",
    dependencies: "Bitcoin Core, Signet, familiarity with Bitcoin Script",
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
    about: [
      thing("Bitcoin Script", WIKIDATA.bitcoinScript),
      thing("Taproot", WIKIDATA.taproot),
    ],
    ...(a.url ? { sameAs: [a.url] } : {}),
  };
}

/** ItemList for one series page. */
export function seriesGraph(s: Series, articles: { id: number; title: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/series/${s.id}#list`,
    name: s.name,
    ...(s.description ? { description: s.description } : {}),
    numberOfItems: articles.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: articles.map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/articles/${a.id}`,
      name: a.title,
    })),
  };
}

/** Render a JSON-LD block. Callers pass objects they built, never user input. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
