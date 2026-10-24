Cahier des charges — Plugin Obsidian "Setup Exporter"

1. Objectif

Plugin Obsidian qui génère une note Markdown documentant la configuration du vault de l'utilisateur, afin qu'il puisse la partager publiquement (blog, communauté, lecteurs) sans exposer de données sensibles ni le contenu de son vault.

2. Fonctionnalité principale

Une commande (palette de commandes + un bouton dans settings) : "Setup Exporter: Rapport"
Au déclenchement, le plugin :
Collecte les informations listées en section 3.
Génère un fichier Markdown structuré (section 4).
Crée ou met à jour une note Setup-Export.md à la racine du vault (ou dans un dossier configurable dans setting).
Ouvre cette note automatiquement après génération.

3. Données à collecter

3.1 Paramètres généarux

Tous les règlages d'Obsidian.

3.2 Plugins core (natifs)

Liste des plugins core activés (via app.internalPlugins.plugins), avec pour chacun la liste de leurs option.


3.3 Plugins communautaires

Nom, id, version, auteur, description courte (via app.plugins.manifests)
Statut : activé / installé mais désactivé (toggle pour inclure ou non les désactivés)
Générer pour chacun un lien d'installation direct : obsidian://show-plugin?id=<id>
Lien vers le gitHub
Options sélecionnéesz

3.4 Thème et apparence

Thème actif (via app.customCss.theme)
Liste des snippets CSS activés (via app.customCss.enabledSnippets)
Mode (clair/sombre) si pertinent

3.5 Templates

Dossier de templates configuré (core Templates ou Templater, à détecter automatiquement si possible)
Liste des noms de fichiers de templates (pas forcément leur contenu complet)
Option : inclure ou exclure le contenu des templates (checkbox dans les réglages)

3.6 Raccourcis clavier (optionnel, désactivable)

Liste des hotkeys personnalisées (uniquement celles modifiées par l'utilisateur, pas les valeurs par défaut)

4. Format de sortie (Markdown)

Suis la structure des mesures.


6. Contraintes de sécurité / confidentialité
Ne jamais lire ni exporter le contenu brut de .obsidian/ (pas de clés API, tokens, chemins absolus du système).
Ne jamais inclure automatiquement le contenu des notes du vault, hors templates si explicitement activé par l'utilisateur.
Toutes les données exposées doivent provenir des API publiques du plugin Obsidian (app.plugins, app.internalPlugins, app.customCss), pas d'une lecture de fichiers système.

7. Contraintes techniques
TypeScript, structure standard d'un plugin Obsidian (manifest.json, main.ts, build via esbuild).
Compatible desktop et mobile si possible (rester sur l'API Obsidian).
