import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro">
            Get Started →
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="AI Agent Framework"
      description="GaussFlow — AI Agent Framework with Hexagonal Architecture, built on Vercel AI SDK v6">
      <HomepageHeader />
      <main>
        <section style={{padding: '2rem 0'}}>
          <div className="container">
            <div className="row">
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🏗️ Hexagonal Architecture</Heading>
                <p>Clean separation of concerns with ports and adapters. Swap implementations without changing business logic.</p>
              </div>
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🔌 Plugin System</Heading>
                <p>Extend agent behavior with guardrails, workflows, observability, web scraping, RAG, and evaluations.</p>
              </div>
              <div className="col col--4" style={{padding: '1rem'}}>
                <Heading as="h3">🌐 Multi-Runtime</Heading>
                <p>Runs on Node.js, Deno, Bun, Edge (Cloudflare Workers), and Browser with auto-detection.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
