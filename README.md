# Envoi de messages WhatsApp

Petite application web (Node.js, **aucune dépendance**) pour envoyer des messages WhatsApp via l'API officielle **WhatsApp Cloud** de Meta.

Fonctionnalités :
- envoi de **messages texte** à un ou plusieurs destinataires (jusqu'à 50 par envoi) ;
- envoi de **templates** approuvés, avec variables `{{1}}`, `{{2}}`… ;
- normalisation des numéros (`+33 6 12…`, `0033…`) ;
- historique des envois avec le statut renvoyé par Meta ;
- **mode simulation** automatique si aucun identifiant n'est configuré.

## Démarrage

Prérequis : Node.js 22 ou plus.

```bash
cp .env.example .env   # puis renseigner WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID
npm start
```

Ouvrir ensuite http://localhost:3000.

## Obtenir les identifiants Meta

1. Créer une app de type **Business** sur https://developers.facebook.com/apps.
2. Ajouter le produit **WhatsApp**, puis ouvrir **WhatsApp → API Setup**.
3. Copier le **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. Copier le **jeton d'accès** → `WHATSAPP_TOKEN` (le jeton temporaire expire en 24 h ; pour la production, créer un *System User* avec un jeton permanent dans le Business Manager).
5. En mode test, ajouter les numéros destinataires dans la liste autorisée de la page API Setup.

## Bon à savoir

- Un **message libre** n'est délivré que si le destinataire a écrit à votre numéro dans les dernières **24 h**. En dehors de cette fenêtre, il faut utiliser un **template** approuvé (le template `hello_world`, langue `en_US`, est disponible par défaut pour tester).
- Le jeton n'est jamais exposé au navigateur : seul le serveur appelle l'API Meta.
- L'historique est conservé en mémoire (perdu au redémarrage).

## API

| Méthode | Route          | Description |
|---------|----------------|-------------|
| POST    | `/api/send`    | `{ "to": "+336..., +336...", "type": "text", "text": "..." }` ou `{ "to": "...", "type": "template", "template": "hello_world", "language": "en_US", "params": [] }` |
| GET     | `/api/history` | Derniers envois |
| GET     | `/api/status`  | Indique si le mode simulation est actif |

## Tests

```bash
npm test
```
