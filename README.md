# MANAGER LIVE · Version complète

Simulation collective de décisions managériales pour le BUT QLIO. La version locale fonctionne à partir de fichiers HTML, CSS et JavaScript, sans compte, serveur ni connexion Internet.

## Mettre la version complète en ligne sur Render

1. Décompressez `MANAGER_LIVE_RENDER.zip`. Placez les fichiers et le dossier `assets` à la racine d’un dépôt GitHub dédié à cette version. Vous pouvez aussi utiliser une branche distincte de votre dépôt existant. Conservez le prototype pour garder son lien de test.
2. Dans Render, choisissez **New → Blueprint** et sélectionnez le dépôt et la branche de la version complète. Le Blueprint `render.yaml` crée le service **manager-live-classe** dans l’offre **Free** et génère la valeur de `TEACHER_PASSWORD`.
3. Attendez le statut **Live**. Ouvrez **Environment** dans le service et copiez la valeur de `TEACHER_PASSWORD`. Gardez-la privée.
4. Ouvrez l’adresse HTTPS du service suivie de `/teacher`, connectez-vous et sélectionnez les situations. Commencez la séance, puis partagez le **Lien de vote étudiant** et ouvrez la vue **Projection**. Glissez cette fenêtre sur l’écran projeté si vous disposez d’un deuxième écran. Sur un seul écran, le bouton **Projection · F** bascule l’affichage dans l’onglet enseignant.
5. Testez un vote depuis un téléphone en 4G/5G. Fermez le vote, puis cliquez séparément sur **Révéler les résultats**. Vérifiez que les barres apparaissent à cette dernière étape sur l’écran projeté.

L’adresse `/projection` présente uniquement les informations affichées à la classe. Elle est en lecture seule et accessible à toute personne disposant du lien. Les étudiants rejoignent `/student` avec le code à huit caractères de la séance. Le mot de passe reste réservé à l’enseignant. Utilisez un seul tableau de bord enseignant à la fois. Le code change au démarrage d’une nouvelle séance.

Les bulletins en cours sont conservés en mémoire sur Render. Un redémarrage du service ou sa mise en veille peut demander une nouvelle connexion, changer le code et effacer les bulletins en cours. Le navigateur enseignant conserve sa dernière progression et les tours déjà récupérés. Ouvrez le service avant le cours.

## Lancer la version locale

1. Décompressez toute l’archive dans un dossier accessible en écriture.
2. Ouvrez `MANAGER_LIVE/index.html` dans Chrome ou Edge. Sous Windows, `LANCER_MANAGER_LIVE.bat` ouvre le fichier dans le navigateur par défaut.
3. Choisissez les situations et ouvrez une séance. La sélection initiale contient cinq dilemmes et la finale de 17h20.
4. Affichez la situation, ouvrez le vote, puis choisissez la saisie des totaux, le vote manuel au poste enseignant ou la simulation. Fermez le vote et révélez les résultats pour lancer le débat.
5. Lorsque le scénario le prévoit, révélez l’information supplémentaire, puis ouvrez un nouveau tour. En finale, quatre informations peuvent être révélées successivement.

La touche **F** active la projection. Les commandes secondaires et les relances sont masquées à l’écran. Quittez la projection pour saisir ou simuler des votes. Dans une séance, **→** parcourt les étapes, **←** revient en arrière, **R** révèle les résultats, **N** affiche la nouvelle information et **D** ouvre le débat ou affiche les relances.

Le **mode étudiant / démonstration** propose deux situations d’essai et un parcours individuel sur le même appareil. Il est indépendant de la dernière séance enseignant.

## Modifier la banque

Dans la banque, utilisez **Exporter les situations**, éditez le JSON dans un éditeur de texte, puis utilisez **Importer des situations**. L’import remplace la banque dans l’onglet courant après validation de tout le tableau. Conservez le JSON pour les séances futures. Une séance commencée conserve une copie de ses situations.

Un scénario doit avoir un identifiant unique, un titre, une catégorie, une heure fictive au format `HH:MM`, un contexte, une question, un point d’apprentissage, des questions de débrief et trois ou quatre choix ordonnés A, B, C, D. Les formats acceptés sont `rapide`, `dilemme`, `surprise`, `position`, `premiere` et `finale`. Le champ `duration` est une durée entière en minutes. Ajoutez `surprise` pour une révélation et `updates` pour une suite de révélations. Chaque choix porte six scores entiers entre −3 et +3.

Pour modifier la banque par défaut dans le dossier, ajoutez ou modifiez une entrée dans `scenarios.js`. Conservez la finale en dernière position dans ce fichier et ajoutez les nouvelles entrées juste avant elle. Utilisez un identifiant inédit, par exemple `S052`, et conservez les identifiants des entrées existantes.

Pour personnaliser l’accueil, remplacez le visuel livré `assets/manager.png` par votre illustration.

## Interpréter les chiffres

- Un vote enregistré correspond à une décision. Le bilan cumule les suffrages des tours révélés, y compris les éventuels seconds votes.
- Un changement est mesuré si l’application peut relier les deux votes d’une même personne. Les simulations associent des bulletins fictifs entre tours. Les totaux saisis ne permettent pas de connaître le nombre de changements individuels.
- Le profil moyenne les scores du dernier tour révélé et non vide de chaque situation, avec un poids égal par situation. La conversion met le score neutre à 50 sur 100.
- La sauvegarde de la dernière séance et des préférences dépend du stockage local de l’adresse et du navigateur utilisés. Si le navigateur bloque ce stockage, la séance fonctionne dans l’onglet. Gardez cet onglet ouvert.

## Fichiers principaux

- `index.html` contient la structure de l’interface.
- `style.css` contient les styles de la projection et des petits écrans.
- `app.js` contient le moteur de séance.
- `scenarios.js` contient les 51 situations et les dimensions du profil.
- `assets/` accueille les visuels.

## Lancer le vote par téléphones

1. Installez Node.js 18 ou plus récent sur le PC enseignant.
2. Sous Windows, double-cliquez sur `START_SERVER.bat`. Sur un autre système, lancez `node server.js` depuis le dossier de l’application.
3. Sur le PC enseignant, ouvrez `http://localhost:3000/teacher` dans un seul onglet. L’écran enseignant indique que le mode connecté est actif.
4. Connectez les téléphones au même Wi-Fi. Faites saisir l’adresse **Étudiants** affichée dans la console, par exemple `http://192.168.1.42:3000/student`. S’il y a plusieurs adresses, utilisez celle de l’adaptateur Wi-Fi. Le pare-feu du PC doit autoriser Node.js sur le réseau privé et le Wi-Fi doit permettre aux appareils de se joindre.
5. Ouvrez le vote depuis l’écran enseignant. Les étudiants appuient sur un choix. Le compteur se met à jour sur l’écran enseignant. Fermez le tour avant de révéler les résultats.

Les votes sont anonymes et verrouillés après enregistrement à chaque tour. Le même onglet étudiant doit rester ouvert pour rapprocher les bulletins entre deux tours. Le calcul des changements d’avis en mode connecté utilise les bulletins appariés. Les votes encore en cours de collecte sont conservés en mémoire par le serveur. Gardez la fenêtre du serveur ouverte pendant la séance.

Pour repasser aux commandes de vote locales, quittez la projection si elle est active, puis cliquez sur **Quitter le mode connecté**. Vous pouvez aussi ouvrir `index.html` pour une séance autonome. Les stockages de ces deux adresses sont distincts.

La projection connectée utilise `projection.html` et `projection.js`. Le serveur, l’adaptateur enseignant et l’écran téléphone sont fournis dans `server.js`, `teacher-lan.js`, `student.html` et `student-lan.js`. Le lancement autonome ne charge aucun de ces fichiers.
