# Graph Report - .  (2026-07-16)

## Corpus Check
- 206 files · ~126,002 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1253 nodes · 3730 edges · 76 communities (63 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.78)
- Token cost: 83,811 input · 0 output

## Community Hubs (Navigation)
- Páginas Admin y Branding
- Páginas Admin y Editor de Mapeos
- Detalle de Marcas y Dashboard
- Sugerencias IA y Traducción
- Dependencias Dev (package.json)
- Sidebar y Filtros de Catálogo
- Cliente IA: Sugerencias y NCM
- Sincronización Crestron
- Páginas de Administración CRUD
- Configuración TypeScript
- Portal Sonance: API y Parsers
- Configurador de Producto
- Motor de Consulta de Catálogo
- Carrito y Solicitudes Draft
- Grillas y Tablas de Catálogo
- Listas de Precios Compartibles
- Importación Sonance y Crestron
- Enriquecimiento de Producto (API)
- Imágenes y Descripciones IA
- Mapeo de Importación (Apply)
- Acciones de Usuario Portal
- Conceptos README: Arquitectura
- Páginas Admin: IA y Tickets
- Dependencias de Producción
- Panel de Datos del Portal
- Endpoints Sonance (API Routes)
- Edición de Producto Admin
- Detalle de Solicitudes y Listas
- Acciones Admin de Catálogo
- Crestron Home: Dispositivos
- Roles Personalizados y Permisos
- Catálogo Admin: Columnas y Filtros
- Autenticación y Login
- Portal Sonance: Listing API
- Asistente IA de Producto
- Layout del Portal Cliente
- Bundles y Accesorios
- Parser de Excel Sonance
- Landing Admin y Paneles
- Formulario de Producto
- Guards de Autorización
- Ficha Rica de Producto
- Sugerencias de Taxonomía
- Layout Admin y Ticker Dólar
- Config Comercial de Clientes
- Reglas de Precios
- Gestión de Roles de Usuario
- Multi-selección de Catálogo
- Navegación Sidebar Admin
- Conceptos README: Stack
- Cookies y Requests Sonance
- Mapeo SKU a Portal
- Modal Descripciones Masivas
- Páginas de Listas Compartidas
- Layout Raíz de la App
- Acciones de Clientes
- Landing: Hero y Posts
- Endpoint Setup Marcas
- Acciones de Tickets
- Cliente Prisma
- Seed de Base de Datos
- Endpoint de Columnas
- Tarjeta Preview de Precios
- Endpoint Setup (POST)
- Endpoint Setup (GET)
- Adaptador Prisma Auth
- Utilidad clsx
- Framework Next.js
- Configuración Next.js
- Librería React
- React DOM
- Utilidad tailwind-merge
- Librería xlsx
- Configuración Tailwind
- Handlers HTTP Auth

## God Nodes (most connected - your core abstractions)
1. `requireAdmin()` - 227 edges
2. `Button` - 61 edges
3. `Badge()` - 60 edges
4. `Card()` - 59 edges
5. `getSetting()` - 59 edges
6. `CardContent()` - 58 edges
7. `formatUsd()` - 44 edges
8. `PageHeader()` - 43 edges
9. `requireUser()` - 42 edges
10. `Input` - 41 edges

## Surprising Connections (you probably didn't know these)
- `parseExcelBuffer()` --references--> `xlsx`  [EXTRACTED]
  src/services/excel.ts → package.json
- `parseSonanceExcel()` --references--> `xlsx`  [EXTRACTED]
  src/services/sonance-import.ts → package.json
- `POST()` --references--> `@prisma/client`  [EXTRACTED]
  src/app/api/setup/route.ts → package.json
- `AdminBrandingPage()` --calls--> `requireAdmin()`  [EXTRACTED]
  src/app/admin/branding/page.tsx → src/lib/auth-helpers.ts
- `CrestronHomePage()` --calls--> `requireAdmin()`  [EXTRACTED]
  src/app/admin/crestron-home/page.tsx → src/lib/auth-helpers.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo de cálculo de precio por cliente** — readme_pricing_engine, readme_margin_rules, readme_discount_rules, readme_visible_breakdown, readme_lib_catalog [EXTRACTED 1.00]
- **Pipeline de importación de Excel al modelo canónico** — readme_services_excel, readme_services_openai, readme_excel_import_pipeline, readme_raw_imported_product [EXTRACTED 1.00]
- **Arquitectura preparada para Fase 2 y Fase 3** — readme_prisma_schema, readme_scraper_interface, readme_ai_mocks_fallback, readme_fase_2, readme_fase_3 [INFERRED 0.85]

## Communities (76 total, 13 thin omitted)

### Community 0 - "Páginas Admin y Branding"
Cohesion: 0.06
Nodes (52): keys, metadata, modelKey, AdminBrandingPage(), keys, metadata, AdminClientDetailPage(), metadata (+44 more)

### Community 1 - "Páginas Admin y Editor de Mapeos"
Cohesion: 0.11
Nodes (44): metadata, metadata, metadata, metadata, metadata, MappingEditor(), Props, SuggestionItem (+36 more)

### Community 2 - "Detalle de Marcas y Dashboard"
Cohesion: 0.08
Nodes (37): Brand, BrandDetailPanel(), Product, metadata, AdminDashboardPage(), metadata, Props, metadata (+29 more)

### Community 3 - "Sugerencias IA y Traducción"
Cohesion: 0.07
Nodes (44): ApproveAllButton(), AiSuggestResponseButton(), POST(), TranslateResponse, POST(), TranslateResponse, generateRequestAiSuggestion(), approveAllRows() (+36 more)

### Community 4 - "Dependencias Dev (package.json)"
Cohesion: 0.05
Nodes (41): autoprefixer, eslint, eslint-config-next, devDependencies, autoprefixer, eslint, eslint-config-next, postcss (+33 more)

### Community 5 - "Sidebar y Filtros de Catálogo"
Cohesion: 0.09
Nodes (27): ScraperRunner(), CatalogActiveFilters(), CatalogLayout(), CatalogSidebar(), FilterSection(), PRICE_PRESETS, Props, StockOption() (+19 more)

### Community 6 - "Cliente IA: Sugerencias y NCM"
Cohesion: 0.08
Nodes (20): AiSuggestionsClient(), Product, RowState, Suggestion, NcmSearchClient(), metadata, NcmPage(), GET() (+12 more)

### Community 7 - "Sincronización Crestron"
Cohesion: 0.12
Nodes (30): CrestronSyncPanel(), Filter, fmtPrice(), stockBadge(), TARGET_HELP, TARGET_LABELS, categoryLabelFor(), CategoryTarget (+22 more)

### Community 8 - "Páginas de Administración CRUD"
Cohesion: 0.08
Nodes (26): AdminApiKeysPage(), mask(), AdminBrandsPage(), AdminCategoriesPage(), AdminClientsPage(), AdminDiscountsPage(), AdminDistributorsPage(), AdminFamiliesPage() (+18 more)

### Community 9 - "Configuración TypeScript"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+21 more)

### Community 10 - "Portal Sonance: API y Parsers"
Cohesion: 0.12
Nodes (27): GET(), PayloadIndex, SonanceBrand, SonanceProduct, apiGet(), asStr(), BrandCategory, brandPriority() (+19 more)

### Community 11 - "Configurador de Producto"
Cohesion: 0.12
Nodes (22): AccessoryContext, AddedDetail, AddToRequestPanel(), Props, AiContentNotice(), getValueList(), Option, ProductConfigurator() (+14 more)

### Community 12 - "Motor de Consulta de Catálogo"
Cohesion: 0.11
Nodes (25): ProductsPage(), buildCatalogWhere(), buildSearchAnd(), buildSearchOr(), CatalogContext, countFacet(), FacetOption, getCatalog() (+17 more)

### Community 13 - "Carrito y Solicitudes Draft"
Cohesion: 0.14
Nodes (26): CartRedirectPage(), accessoryAckNote(), evaluateAccessoryPolicy(), requireCommercialClientId(), getOrCreateActiveDraft(), migrateLegacyCartIntoDraft(), addItemSchema, addItemsToDraftBundle() (+18 more)

### Community 14 - "Grillas y Tablas de Catálogo"
Cohesion: 0.14
Nodes (20): ProductsBulkBar(), Item, Props, ShareListTable(), AddToDraftButton(), Props, CatalogGrid(), StockBadge() (+12 more)

### Community 15 - "Listas de Precios Compartibles"
Cohesion: 0.15
Nodes (22): EditShareListPage(), AdminShareListsPage(), metadata, PublicShareListPage(), Option, Props, getClientVisibility(), applyClientVisibilityToWhere() (+14 more)

### Community 16 - "Importación Sonance y Crestron"
Cohesion: 0.14
Nodes (23): CrestronSyncPage(), mask(), brandTone(), Filter, fmtPrice(), SonanceImportPanel(), TARGET_HELP, TARGET_LABELS (+15 more)

### Community 17 - "Enriquecimiento de Producto (API)"
Cohesion: 0.14
Nodes (22): EnrichRequest, EnrichResponse, NormalizedDoc, normalizeDocs(), NormalizedSpec, normalizeSpecs(), pickAccessorySkus(), POST() (+14 more)

### Community 18 - "Imágenes y Descripciones IA"
Cohesion: 0.14
Nodes (20): Image, Props, SerperResult, ALLOWED_TYPES, attachProductImage(), BulkDescriptionResult, bulkGenerateDescriptions(), bulkSearchImages() (+12 more)

### Community 19 - "Mapeo de Importación (Apply)"
Cohesion: 0.15
Nodes (21): ApplyMappingRequest, ApplyMappingResponse, BRAND_KEYWORDS, coerceForField(), coerceKind(), coerceStockStatus(), extractNumber(), inferBrandFromKeywords() (+13 more)

### Community 20 - "Acciones de Usuario Portal"
Cohesion: 0.13
Nodes (21): requireUser(), schema, submitAiFeedback(), postRequestMessage(), sendRequest(), addToCart(), addToList(), addToListSchema (+13 more)

### Community 21 - "Conceptos README: Arquitectura"
Cohesion: 0.11
Nodes (22): Panel Admin (usuarios, productos, importaciones, reglas), AdminSetting — API keys secretas desde la UI, Aviso de contenido IA + feedback de tres niveles, Mocks de IA con fallback sin API keys, Portal Cliente (catálogo, favoritos, listas, solicitudes), Reglas de descuento con prioridad clara, Importación de Excel (detección de columnas, mapeo, upsert canónico), Fase 2 (IA real, scrapers reales, edición masiva avanzada) (+14 more)

### Community 22 - "Páginas Admin: IA y Tickets"
Cohesion: 0.14
Nodes (17): AdminAiPage(), metadata, AdminImportsPage(), MappingsPage(), AdminTicketsPage(), metadata, priorityTone, statusTone (+9 more)

### Community 23 - "Dependencias de Producción"
Cohesion: 0.10
Nodes (21): bcryptjs, @hookform/resolvers, lucide-react, next-auth, openai, dependencies, bcryptjs, @hookform/resolvers (+13 more)

### Community 24 - "Panel de Datos del Portal"
Cohesion: 0.13
Nodes (11): asArray(), BadgeItem, badgeText(), CommercialSection(), DocItem, fmtDate(), HeaderSection(), isAnyFieldSet() (+3 more)

### Community 25 - "Endpoints Sonance (API Routes)"
Cohesion: 0.18
Nodes (16): GET(), POST(), GET(), POST(), Target, bucketKey(), loadDetailChunk(), loadPayloadIndex() (+8 more)

### Community 26 - "Edición de Producto Admin"
Cohesion: 0.13
Nodes (14): AccessoriesPanel(), ProductImagesPanel(), ProductOptionsPanel(), AdminProductEditPage(), SectionRef, SECTIONS, LabelOption, LabelSelector() (+6 more)

### Community 27 - "Detalle de Solicitudes y Listas"
Cohesion: 0.23
Nodes (12): AdminRequestDetailPage(), ListDetailPage(), RequestDetailPage(), metadata, WishlistPage(), EmptyState(), EmptyStateProps, resolveCommercialClientId() (+4 more)

### Community 28 - "Acciones Admin de Catálogo"
Cohesion: 0.14
Nodes (17): slugify(), brandSchema, bulkByFilterSchema, bulkSchema, bulkSetActiveByFilter(), catSchema, deleteBrand(), distSchema (+9 more)

### Community 29 - "Crestron Home: Dispositivos"
Cohesion: 0.16
Nodes (13): CrestronActionsBar(), CrestronHomePage(), metadata, Product, ProductCompatList(), CRESTRON_SEED_DATA, db, deleteCrestronDevice() (+5 more)

### Community 30 - "Roles Personalizados y Permisos"
Cohesion: 0.18
Nodes (11): baseRoleLabel, CustomRolesManager(), Props, AdminCustomRolesPage(), metadata, parsePermissions(), PERMISSION_GROUPS, PERMISSION_LABEL (+3 more)

### Community 31 - "Catálogo Admin: Columnas y Filtros"
Cohesion: 0.15
Nodes (12): ALL_COLUMNS, ColumnDef, ColumnKey, DEFAULT_COLUMNS, Filters, Option, ProductPreviewModal(), ProductsCatalogAdmin() (+4 more)

### Community 32 - "Autenticación y Login"
Cohesion: 0.15
Nodes (10): RoleSummary, LoginForm(), metadata, credentialsSchema, { handlers, auth, signIn, signOut }, next-auth, Session, User (+2 more)

### Community 33 - "Portal Sonance: Listing API"
Cohesion: 0.20
Nodes (11): GET(), GET(), ensureBrandId(), isAuthorizedBySetupToken(), PortalCategory, PortalListingProduct, PortalListingResponse, POST() (+3 more)

### Community 34 - "Asistente IA de Producto"
Cohesion: 0.16
Nodes (11): ProductAiAssist(), Props, Suggestion, SuggestionItem, Props, Tab, Tabs(), applyClassificationSuggestion() (+3 more)

### Community 35 - "Layout del Portal Cliente"
Cohesion: 0.19
Nodes (8): navItems, PortalShell(), DraftMiniCart(), Props, RecentItem, ActiveToast, PortalToaster(), ToastDetail

### Community 36 - "Bundles y Accesorios"
Cohesion: 0.18
Nodes (12): AccessoryAddButton(), BundleAccessoryButtonProps, BundleAddAccessoryButton(), BundleContextType, BundleCtx, BundlePanelProps, BundleStagingPanel(), ProductBundleProvider() (+4 more)

### Community 37 - "Parser de Excel Sonance"
Cohesion: 0.32
Nodes (13): boxRequest(), cleanName(), cookieHeader(), downloadFromBoxLink(), isExcelBuffer(), isNumber(), isSkuString(), isSonanceHeader() (+5 more)

### Community 38 - "Landing Admin y Paneles"
Cohesion: 0.19
Nodes (9): AdminLandingPage(), metadata, ProductRef, Props, RelationItem, Option, Props, ConfirmSubmit() (+1 more)

### Community 39 - "Formulario de Producto"
Cohesion: 0.18
Nodes (9): DescriptionsSection(), Props, metadata, NewProductPage(), Option, ProductForm(), Props, upsertProduct() (+1 more)

### Community 40 - "Guards de Autorización"
Cohesion: 0.26
Nodes (10): BulkActiveBar(), AdminProductsPage(), multi(), SORT_MAP, SP, canSeePrices(), requireClient(), requirePermission() (+2 more)

### Community 41 - "Ficha Rica de Producto"
Cohesion: 0.24
Nodes (11): asArray(), BadgeItem, badgeText(), DocItem, fileIconForType(), getVideoEmbedUrl(), isImageUrl(), ProductRichInfo() (+3 more)

### Community 42 - "Sugerencias de Taxonomía"
Cohesion: 0.36
Nodes (11): acceptAllTaxonomySuggestions(), acceptTaxonomySuggestion(), clearAllTaxonomyData(), ensureTaxonomyAndAssign(), generateAndApplyTaxonomySuggestions(), generateTaxonomySuggestions(), normalizeName(), rejectTaxonomySuggestion() (+3 more)

### Community 43 - "Layout Admin y Ticker Dólar"
Cohesion: 0.25
Nodes (6): AdminShell(), DolarData, DolarRate, DolarTicker(), fmt(), getCurrentPermissions()

### Community 44 - "Config Comercial de Clientes"
Cohesion: 0.20
Nodes (9): commercialSchema, createClientAccountMovement(), deleteClientExtraDiscount(), deleteClientVisibility(), discountSchema, movementSchema, saveClientCommercialConfig(), toggleClientMovementPaid() (+1 more)

### Community 45 - "Reglas de Precios"
Cohesion: 0.22
Nodes (8): deleteDiscountRule(), deleteMarginRule(), deleteVisibility(), ruleSchema, upsertDiscountRule(), upsertMarginRule(), upsertVisibility(), visibilitySchema

### Community 46 - "Gestión de Roles de Usuario"
Cohesion: 0.22
Nodes (8): permissionsObjectSchema, roleSchema, toggleCustomRoleActive(), updateUserFull(), updateUserFullSchema, upsertCustomRole(), upsertCustomRoleVisual(), visualRoleSchema

### Community 47 - "Multi-selección de Catálogo"
Cohesion: 0.29
Nodes (7): CatalogMultiSelectProvider(), MultiSelectContext, MultiSelectCtx, Props, SelectableCard(), useMultiSelect(), bulkAddToDraftSimple()

### Community 48 - "Navegación Sidebar Admin"
Cohesion: 0.32
Nodes (7): AdminSidebarNav(), groups, isActive(), NavGroup, NavItem, Props, PermissionScope

### Community 49 - "Conceptos README: Stack"
Cohesion: 0.38
Nodes (7): Auth.js v5 (NextAuth) con credenciales + bcrypt + JWT, JWT + Edge Middleware Route Protection, Next.js 14 (App Router), PostgreSQL, Prisma ORM, Soundtec Plataforma B2B, Deploy en Vercel + Postgres externo (Neon/Supabase/Render)

### Community 50 - "Cookies y Requests Sonance"
Cohesion: 0.48
Nodes (6): cookieStr(), GET(), getCookieNames(), parseCookies(), rawRequestOnce(), StepResult

### Community 51 - "Mapeo SKU a Portal"
Cohesion: 0.43
Nodes (6): ensureBrandId(), isAuthorizedBySetupToken(), loadPayloadIndex(), PayloadIndex, POST(), SkuToPortalEntry

### Community 52 - "Modal Descripciones Masivas"
Cohesion: 0.29
Nodes (6): BulkDescriptionsModal(), Props, ResultRow, Step, DescriptionType, saveBulkDescriptions()

### Community 53 - "Páginas de Listas Compartidas"
Cohesion: 0.33
Nodes (4): metadata, metadata, NewShareListPage(), ShareListForm()

### Community 54 - "Layout Raíz de la App"
Cohesion: 0.40
Nodes (3): generateMetadata(), inter, Providers()

### Community 55 - "Acciones de Clientes"
Cohesion: 0.33
Nodes (5): clientSchema, createPortalUser(), portalUserSchema, toggleClientActive(), upsertClient()

### Community 56 - "Landing: Hero y Posts"
Cohesion: 0.33
Nodes (5): deletePost(), heroSchema, postSchema, upsertHero(), upsertPost()

### Community 57 - "Endpoint Setup Marcas"
Cohesion: 0.60
Nodes (4): BRAND_KEYWORDS, ensureBrandId(), isAuthorizedBySetupToken(), POST()

### Community 58 - "Acciones de Tickets"
Cohesion: 0.40
Nodes (4): createSchema, createTicket(), updateSchema, updateTicket()

### Community 59 - "Cliente Prisma"
Cohesion: 0.50
Nodes (3): @prisma/client, @prisma/client, POST()

### Community 61 - "Endpoint de Columnas"
Cohesion: 0.50
Nodes (3): ColumnInfo, COLUMNS, GET()

### Community 62 - "Tarjeta Preview de Precios"
Cohesion: 0.67
Nodes (3): fmt(), PricingPreviewCard(), Props

## Knowledge Gaps
- **386 isolated node(s):** `nextConfig`, `name`, `version`, `private`, `dev` (+381 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `requireAdmin()` connect `Páginas de Administración CRUD` to `Páginas Admin y Branding`, `Páginas Admin y Editor de Mapeos`, `Detalle de Marcas y Dashboard`, `Sugerencias IA y Traducción`, `Sidebar y Filtros de Catálogo`, `Cliente IA: Sugerencias y NCM`, `Sincronización Crestron`, `Portal Sonance: API y Parsers`, `Carrito y Solicitudes Draft`, `Listas de Precios Compartibles`, `Importación Sonance y Crestron`, `Enriquecimiento de Producto (API)`, `Imágenes y Descripciones IA`, `Mapeo de Importación (Apply)`, `Páginas Admin: IA y Tickets`, `Endpoints Sonance (API Routes)`, `Edición de Producto Admin`, `Detalle de Solicitudes y Listas`, `Acciones Admin de Catálogo`, `Crestron Home: Dispositivos`, `Roles Personalizados y Permisos`, `Catálogo Admin: Columnas y Filtros`, `Portal Sonance: Listing API`, `Asistente IA de Producto`, `Landing Admin y Paneles`, `Formulario de Producto`, `Guards de Autorización`, `Sugerencias de Taxonomía`, `Config Comercial de Clientes`, `Reglas de Precios`, `Gestión de Roles de Usuario`, `Cookies y Requests Sonance`, `Mapeo SKU a Portal`, `Modal Descripciones Masivas`, `Páginas de Listas Compartidas`, `Acciones de Clientes`, `Landing: Hero y Posts`, `Endpoint Setup Marcas`, `Acciones de Tickets`, `Endpoint de Columnas`, `Endpoint Setup (POST)`, `Endpoint Setup (GET)`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Dependencias de Producción` to `Adaptador Prisma Auth`, `Utilidad clsx`, `Framework Next.js`, `Dependencias Dev (package.json)`, `Librería React`, `React DOM`, `Utilidad tailwind-merge`, `Librería xlsx`, `Cliente Prisma`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `xlsx` connect `Librería xlsx` to `Sugerencias IA y Traducción`, `Parser de Excel Sonance`, `Dependencias de Producción`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `version` to the rest of the system?**
  _386 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Páginas Admin y Branding` be split into smaller, more focused modules?**
  _Cohesion score 0.06438631790744467 - nodes in this community are weakly interconnected._
- **Should `Páginas Admin y Editor de Mapeos` be split into smaller, more focused modules?**
  _Cohesion score 0.11394230769230769 - nodes in this community are weakly interconnected._
- **Should `Detalle de Marcas y Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.08295625942684766 - nodes in this community are weakly interconnected._