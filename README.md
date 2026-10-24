# Setup Exporter

Plugin Obsidian qui crée une note Markdown listant les plugins et des éléments de configuration du vault.

## Utilisation

Lancez **Setup Exporter: Report** dans la palette de commandes ou dans les réglages du plugin. La note `Setup-Export.md` est générée à la racine du vault puis ouverte. Un dossier de destination reste configurable.

Le rapport présente les réglages généraux d’Obsidian dont la valeur actuelle diffère d’une valeur par défaut explicitement exposée par leur définition (`control.defaultValue`). Les valeurs identiques et les options sans défaut connu sont omises. Une valeur vide différente du défaut est représentée par ∅. Les options des plugins natifs et communautaires ne sont ni collectées ni exportées.

Les plugins natifs activés sont regroupés dans une liste à puces sous `Preferences → Core plugins`, avec leur nom en gras. Leur activation est vérifiée par `internalPlugins.getEnabledPluginById` ; si cette méthode est absente, seul `enabled === true` est accepté. Les plugins communautaires sont regroupés sous `Preferences → Community plugins`, avec une puce par plugin : nom en gras lié à sa page communautaire, un espace, description, puis lien d’installation. Les plugins communautaires désactivés peuvent être inclus sans être chargés. Les raccourcis personnalisés apparaissent sous `Preferences → Hotkeys` ; leur export est activé par défaut et reste désactivable. Le contenu des templates est optionnel.

```markdown
- **[Finition](https://community.obsidian.md/plugins/finition)** Description du plugin. [Install](obsidian://show-plugin?id=finition)
```

Le thème actif et les snippets CSS sont regroupés avec les options du panneau Appearance. Le thème reprend la présentation des plugins : nom en gras lié à sa page communautaire, description, puis lien `obsidian://show-theme?name=…`. La description provient du manifeste en mémoire lorsqu’elle existe ; sinon, le plugin récupère la rubrique « About » de la fiche communautaire du thème. Le nom provient du runtime Obsidian, avec repli sur `vault.getConfig('cssTheme')` lorsque le gestionnaire CSS ne le fournit pas.

Les titres de rubriques utilisent les chemins de navigation, sans numéros. Le rapport utilise `Preferences` en anglais et `Préférences` en français ; les noms des panneaux et des catégories proviennent d’Obsidian. Les plugins sont présentés par nom sous leur catégorie, sans chemin répété ni sous-titre interne. Les sections sans contenu sont omises. Setup Exporter est exclu de son propre rapport. Exemple :

```markdown
## Preferences → Appearance

- Font size : **18**
- Inline title : **✓**
```

Les libellés des panneaux, sections, options et choix sélectionnés sont repris tels quels depuis l’interface Obsidian. Aucun catalogue de traduction ni détection de langue n’est utilisé. Le titre des réglages est présenté comme `Preferences` ou `Préférences`. Les interrupteurs sont représentés par ✓ ou ✗. Les textes propres au rapport sont rédigés en anglais.

Le plugin parcourt les panneaux de réglages généraux de l’Obsidian en cours. Il compare les valeurs à leurs défauts déclarés et utilise les contrôles affichés pour les chemins de navigation. Il n’ouvre aucun panneau de plugin. Il rétablit ensuite le panneau initial et referme les réglages s’ils étaient fermés avant l’export. Il ne clique pas sur les boutons des panneaux et n’émet pas de changement sur les contrôles.

Sur Obsidian 1.13 ou supérieur, les [définitions déclaratives](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/User%20interface/Settings.md) peuvent fournir les clés, libellés, sous-pages et valeurs par défaut des options. Un champ HTML, sa valeur initiale ou la présence d’une clé dans un fichier de configuration ne prouve pas sa valeur par défaut. Ces indications ne sont pas utilisées comme substitut à un défaut déclaré.

Les champs de mot de passe, les champs aux libellés sensibles et les zones de texte multilignes restent exclus de l’export des réglages généraux.

Aucun export JSON de configuration ni capture d’écran n’est produit. Les fichiers `data.json` des autres plugins et le contenu des notes ordinaires ne sont pas lus. Les champs secrets et les données privées reconnaissables sont écartés ou masqués.

Les liens communautaires et d’installation sont construits à partir de l’identifiant du plugin. Si la description du thème manque dans Obsidian, seule sa fiche publique est demandée, sans contenu de notes ni identifiant du vault. La requête attend au plus huit secondes ; un échec réseau ou une fiche sans rubrique « About » n’empêche pas la génération du rapport.

Le Markdown ne contient aucun commentaire d’identification. Le plugin conserve la dernière version de chaque rapport dans ses propres réglages pour vérifier le contenu avant remplacement. Une note inconnue ou modifiée depuis l’export est préservée ; les anciens rapports portant le commentaire d’identification sont reconnus puis remplacés sans ce commentaire. Les caractères Markdown sont échappés avec des antislashs, sans entités numériques dans le texte.

## Développement

Sources TypeScript dans `plugin/`, outils dans `scripts/`. Node.js 22.18 ou supérieur.

```sh
npm ci --ignore-scripts
npm test
npm run build
```

`npm run build` vérifie TypeScript et génère `main.js`. `npm run dev` reconstruit le bundle après modification. Pour installer le plugin, placez `main.js` et `manifest.json` dans `.obsidian/plugins/obsidian-setup-exporter/` puis activez-le dans Obsidian.

Le parcours des panneaux utilise `app.setting.openTabById`, une interface du runtime Obsidian qui n’est pas déclarée dans ses types publics. Les panneaux indisponibles sont omis sans diagnostic dans le rapport.
