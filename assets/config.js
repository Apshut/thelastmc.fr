/* The Last — réglages du site. Tout ce qui change souvent est ici.
   - en              : tout objet qui porte un texte affiché a un sous-objet `en` (mêmes noms de champs, textes anglais) ;
                       les scripts le lisent par T.pick(objet, 'champ'), le français sert de repli. Prix, ids et liens ne changent pas.
   - launcher.url    : lien direct vers l'installateur Windows. Vide = bouton « Bientôt disponible ».
   - launcher.opening: date d'ouverture prévue, par exemple "2026-12-12T18:00:00+01:00". Vide = pas de compte à rebours.
   - community       : lien vers le Discord (ou autre). Vide = pas de bouton.
   - faq.endpoint    : adresse du Worker de Volkar, l'assistant IA de la bulle de l'accueil (volkar.js), par exemple
                       "https://gromaur-faq.<sous-domaine>.workers.dev" (sans / final ; voir faq/README.md).
                       Vide = le chat affiche « Volkar arrive bientôt » et la page ne contacte aucun service.
   - compte          : le bouton de compte, à droite de « EN » (assets/compte.js, voir compte/SPEC.md §5).
     api    : adresse de l'API des comptes, "https://api.thelastmc.fr" (sans / final).
              Vide = l'API n'est pas encore en ligne : le panneau dit « La connexion ouvrira avec le launcher. »
              et le site ne fait AUCUNE requête. Même rempli, le site ne contacte l'API que si ce navigateur s'est
              déjà connecté une fois (clé localStorage « thelast:compte », sans aucun identifiant).
     ouvert : false = le panneau invité dit « La connexion ouvrira avec le launcher. » (la connexion est réservée aux
              testeurs : ils se connectent quand même par le launcher, et le site les reconnaît si api est rempli).
              true = le panneau explique comment se connecter depuis le launcher. Ne décide rien côté sécurité :
              c'est l'API qui filtre (ACCES, TESTEURS).
   - shop            : la taverne (boutique.html). Le site ne vend que des Braises, la monnaie du serveur ;
                       on les dépense EN JEU, au comptoir du tavernier (shop.inGame).
     checkoutUrl : lien de paiement (par exemple une boutique Tebex). Vide = aperçu, boutons « Bientôt ».
     products    : ce qui est posé devant le comptoir. CE SONT DES EXEMPLES : quantités et prix à remplacer.
       kind  = "pack" (un paquet de Braises) ou "don" (soutien sans contrepartie) ;
       prop  = l'objet 3D : "heap" (tas de pièces), "pouch" (bourse), "sack" (sac), "chest" (coffre), "jar" (tronc, sur le comptoir) ;
       url   = lien de paiement propre à l'article (facultatif, sinon checkoutUrl).
     categories  : les grosses tuiles de la fenêtre « Liste d'objets » (assets/catalogue.js), dans l'ordre.
       icon = un objet du jeu ; desc = une phrase ; paliers = true pour les grades (un seul à la fois, le plus haut
       remplace le précédent). Une catégorie sans objet n'est pas affichée ; un objet sans catégorie connue va dans
       « Autres ». Sans aucune catégorie, la fenêtre montre une seule liste.
     inGame      : ce qu'on obtient en jeu avec les Braises (EXEMPLES). Jamais de cape, jamais d'avantage en jeu.
       icon  = un objet du jeu (liste dans tools/site-textures/build.py) ; cat = id de sa catégorie ;
       tags  = des synonymes pour la recherche (sans accents).
       Prix en multiples de 50 : le panier de paquets le moins cher laisse alors peu de Braises en trop.
   - roadmap         : la feuille de route, dessinée par le portail de la grotte (page d'accueil, sous la lave).
                       Le cadre du portail compte 22 blocs ; chaque étape en prend « blocks », dans l'ordre :
                       la base de gauche à droite, puis les deux montants en alternance, puis le haut.
     state = "fait" (obsidienne), "attente" (obsidienne pleureuse), "encours" (en pointillés, mis en avant)
             ou "avenir" (en pointillés) ;
     date  = jour où l'étape est faite (ou demandée, pour « attente »), au format "2026-10-05". Facultatif.
     Quand toutes les étapes sont « fait », le portail s'allume. */
window.THE_LAST = {
  launcher: {
    url: "",
    version: "",
    size: "",
    opening: ""
  },
  community: {
    url: "/discord/",
    label: "Rejoindre le Discord",
    en: { label: "Join the Discord" }
  },
  faq: {
    endpoint: "https://gromaur-faq.gromaur-tickets.workers.dev"
  },
  compte: {
    api: "https://api.thelastmc.fr",
    ouvert: false
  },
  roadmap: [
    { name: "Le site", state: "fait", date: "2026-10-05", blocks: 3,
      text: "Le site que tu lis, avec la taverne et le journal du chantier.",
      en: { name: "The website", text: "The site you're reading, with the Tavern and the devlog." } },
    { name: "Le launcher", state: "fait", date: "2026-10-05", blocks: 3,
      text: "Il installe et met à jour Minecraft, Java, NeoForge, les mods et les réglages du serveur.",
      en: { name: "The launcher", text: "It installs and updates Minecraft, Java, NeoForge, the mods and the server settings." } },
    { name: "La connexion Microsoft", state: "fait", date: "2026-10-06", blocks: 2,
      text: "La connexion par la page officielle de Microsoft, prête dans le launcher.",
      en: { name: "Microsoft sign-in", text: "Signing in through Microsoft's official page, ready in the launcher." } },
    { name: "La taverne", state: "fait", date: "2026-10-07", blocks: 1,
      text: "La boutique des Braises, en aperçu : rien n'y est encore en vente.",
      en: { name: "The Tavern", text: "The Braises shop, in preview: nothing is for sale yet." } },
    { name: "L'accès à la connexion Minecraft", state: "fait", date: "2026-10-08", blocks: 1,
      text: "Chaque launcher doit être autorisé à utiliser la connexion Minecraft. Accès obtenu : on se connecte et on lance le jeu avec son vrai compte.",
      en: { name: "Minecraft sign-in access", text: "Every launcher has to be approved to use Minecraft sign-in. Access granted: you sign in and launch the game with your real account." } },
    { name: "Le monde de The Last", state: "avenir", blocks: 5,
      text: "Le contenu du serveur. Aucune image tant qu'elle n'est pas vraie.",
      en: { name: "The world of The Last", text: "The server's content. No images until they are real." } },
    { name: "L'ouverture", state: "avenir", blocks: 7,
      text: "Le jour où le dernier bloc est posé, le portail s'allume.",
      en: { name: "Opening day", text: "The day the last block is placed, the portal lights up." } }
  ],
  shop: {
    checkoutUrl: "",
    products: [
      { id: "poignee", kind: "pack", prop: "heap", name: "Poignée de Braises", short: "Poignée", braises: 250, price: 2.49,
        lore: "Quelques pièces encore chaudes. De quoi changer la couleur de ton pseudo.",
        en: { name: "Handful of Braises", short: "Handful", lore: "A few coins, still warm. Enough to change your name color." } },
      { id: "bourse", kind: "pack", prop: "pouch", name: "Bourse de Braises", short: "Bourse", braises: 600, price: 4.99,
        lore: "Une bourse de cuir bien pleine. Un titre, une couleur, et il en reste.",
        en: { name: "Pouch of Braises", short: "Pouch", lore: "A well-stuffed leather pouch. A title, a color, and some left over." } },
      { id: "sac", kind: "pack", prop: "sack", name: "Sac de Braises", short: "Sac", braises: 1300, price: 9.99,
        lore: "Un sac de toile qui fume encore. Assez pour un grade ou un compagnon.",
        en: { name: "Sack of Braises", short: "Sack", lore: "A canvas sack that's still smoking. Enough for a rank or a companion." } },
      { id: "coffre", kind: "pack", prop: "chest", name: "Coffre de Braises", short: "Coffre", braises: 2800, price: 19.99,
        lore: "Le coffre entier. Le tavernier le surveille de très près.",
        en: { name: "Chest of Braises", short: "Chest", lore: "The whole chest. The tavernkeeper keeps a very close eye on it." } },
      { id: "soutien", kind: "don", prop: "jar", name: "Tronc de soutien", short: "Soutien", price: 2,
        lore: "Un don pour payer le serveur. Aucune Braise, aucune contrepartie, aucun avantage : juste notre gratitude.",
        en: { name: "Support Jar", short: "Support", lore: "A donation to help pay for the server. No Braises, nothing in return, no perks: just our gratitude." } }
    ],
    categories: [
      { id: "grades", name: "Grades", icon: "gold_ingot", paliers: true,
        desc: "Des paliers : un seul grade à la fois, le plus haut remplace le précédent. Aucun avantage en jeu.",
        en: { name: "Ranks", desc: "Tiers: one rank at a time, the highest replaces the previous one. No in-game advantage." } },
      { id: "pseudo", name: "Pseudo et chat", icon: "writable_book",
        desc: "La couleur de ton pseudo, sa décoration et tes messages d'arrivée.",
        en: { name: "Name and chat", desc: "Your name color, its styling and your join messages." } },
      { id: "titres", name: "Titres", icon: "name_tag",
        desc: "Un titre affiché au-dessus de ta tête et dans le chat.",
        en: { name: "Titles", desc: "A title shown above your head and in chat." } },
      { id: "effets", name: "Traînées et effets", icon: "blaze_powder",
        desc: "Des particules qui suivent tes pas ou saluent ton arrivée. Purement visuelles.",
        en: { name: "Trails and effects", desc: "Particles that follow your steps or greet your arrival. Purely visual." } },
      { id: "compagnons", name: "Compagnons", icon: "strider_spawn_egg",
        desc: "Ils te suivent partout. Ils ne se battent pas, ne ramassent rien, ne se montent pas.",
        en: { name: "Companions", desc: "They follow you everywhere. They don't fight, don't pick anything up, and can't be ridden." } }
    ],
    inGame: [
      { id: "couleur", name: "Couleur de pseudo", braises: 250, icon: "magma_cream", cat: "pseudo",
        lore: "Ton pseudo dans la couleur de ton choix.", tags: ["couleur", "pseudo", "nom", "chat", "teinte"],
        en: { name: "Name Color", lore: "Your name in the color of your choice.", tags: ["color","name","nickname","username","chat","tint","dye"] }
      },
      { id: "titre", name: "Titre personnalisé", braises: 450, icon: "name_tag", cat: "titres",
        lore: "Un titre au-dessus de ta tête.", tags: ["titre", "perso", "personnalise", "nom", "tag", "etiquette"],
        en: { name: "Custom Title", lore: "A title above your head.", tags: ["title","custom","personalized","name","tag","label"] }
      },
      { id: "ames", name: "Traînée d'âmes", braises: 700, icon: "soul_lantern", cat: "effets",
        lore: "Des flammes bleues suivent tes pas.", tags: ["trainee", "particules", "ames", "flammes bleues", "effet"],
        en: { name: "Soul Trail", lore: "Blue flames follow your steps.", tags: ["trail","particles","souls","soul","blue flames","effect"] }
      },
      { id: "grade-cendre", name: "Grade Cendre", braises: 1000, icon: "blaze_powder", cat: "grades",
        lore: "Badge et pseudo couleur cendre dans le chat.", tags: ["grade", "rang", "cendre", "badge", "vip"],
        en: { name: "Ash Rank", lore: "Badge and ash-colored name in chat.", tags: ["rank","ash","cinder","badge","vip"] }
      },
      { id: "arpenteur", name: "Arpenteur de compagnie", braises: 1200, icon: "strider_spawn_egg", cat: "compagnons",
        lore: "Il te suit partout. Il ne fait rien d'autre.", tags: ["compagnon", "pet", "animal", "arpenteur", "strider"],
        en: { name: "Pet Strider", lore: "It follows you everywhere. It does nothing else.", tags: ["companion","pet","animal","strider"] }
      },
      { id: "grade-dore", name: "Grade Doré", braises: 2000, icon: "gold_ingot", cat: "grades",
        lore: "Badge doré et message d'arrivée personnalisé.", tags: ["grade", "rang", "or", "dore", "badge", "vip"],
        en: { name: "Golden Rank", lore: "Golden badge and a custom join message.", tags: ["rank","gold","golden","badge","vip"] }
      },
      { id: "grade-netherite", name: "Grade Netherite", braises: 3600, icon: "netherite_ingot", cat: "grades",
        lore: "Tout le grade Doré, et un titre animé.", tags: ["grade", "rang", "netherite", "badge", "vip", "titre anime"],
        en: { name: "Netherite Rank", lore: "Everything in the Golden Rank, plus an animated title.", tags: ["rank","netherite","badge","vip","animated title"] }
      }
    ]
  }
};
