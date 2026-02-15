import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'GaussFlow',
  tagline: 'AI Agent Framework with Hexagonal Architecture',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://g97iulio1609.github.io',
  baseUrl: '/onegenui-deep-agents/',

  organizationName: 'g97iulio1609',
  projectName: 'onegenui-deep-agents',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/g97iulio1609/onegenui-deep-agents/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'GaussFlow',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://www.npmjs.com/package/@giulio-leone/gaussflow-agent',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/g97iulio1609/onegenui-deep-agents',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
            {
              label: 'Architecture',
              to: '/docs/architecture',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/g97iulio1609/onegenui-deep-agents',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/@giulio-leone/gaussflow-agent',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} GaussFlow. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
