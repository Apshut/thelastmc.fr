/* The Last — réglages du site. Tout ce qui change souvent est ici.
   - launcher.url    : lien direct vers l'installateur Windows. Vide = bouton « Bientôt disponible ».
   - launcher.opening: date d'ouverture prévue, par exemple "2026-12-12T18:00:00+01:00". Vide = pas de compte à rebours.
   - community       : lien vers le Discord (ou autre). Vide = pas de bouton.
   - shop.checkoutUrl: lien de paiement (par exemple une boutique Tebex). Vide = boutique en préparation.
   - shop.products   : articles affichés. CE SONT DES EXEMPLES : noms, textes et prix à remplacer.
     icon = un objet du jeu (gold_ingot, gold_nugget, netherite_ingot, blaze_powder, magma_cream, elytra,
            strider_spawn_egg, soul_lantern, name_tag, totem_of_undying, golden_helmet, saddle, lava_bucket…)
            ou "block:<texture>" (block:gold_block, block:magma, block:netherite_block, block:glowstone…),
            ou "cape" (dessin maison d'une cape).
     group = articles exclusifs entre eux (un seul grade à la fois). stack = true : quantité libre.
            La liste complète est dans tools/site-textures/build.py. */
window.THE_LAST = {
  launcher: {
    url: "",
    version: "",
    size: "",
    opening: ""
  },
  community: {
    url: "",
    label: "Rejoindre le Discord"
  },
  shop: {
    checkoutUrl: "",
    products: [
      { id: "braise", cat: "Grades", name: "Grade Braise", price: 4.99, icon: "blaze_powder", group: "grade",
        lore: "Pseudo couleur braise dans le chat et la liste des joueurs." },
      { id: "dore", cat: "Grades", name: "Grade Doré", price: 9.99, icon: "gold_ingot", group: "grade",
        lore: "Pseudo doré, badge piglin et message d'arrivée personnalisé." },
      { id: "netherite", cat: "Grades", name: "Grade Netherite", price: 19.99, icon: "netherite_ingot", group: "grade",
        lore: "Tout le grade Doré, plus un titre au choix au-dessus de ta tête." },
      { id: "cape", cat: "Cosmétiques", name: "Cape de cendres", price: 3.99, icon: "cape",
        lore: "Une cape sombre aux bords incandescents." },
      { id: "ames", cat: "Cosmétiques", name: "Traînée d'âmes", price: 2.99, icon: "soul_lantern",
        lore: "Des flammes bleues suivent tes pas." },
      { id: "arpenteur", cat: "Cosmétiques", name: "Arpenteur de compagnie", price: 5.99, icon: "strider_spawn_egg",
        lore: "Un petit arpenteur te suit partout. Il ne fait rien d'autre, et il le fait bien." },
      { id: "soutien", cat: "Soutien", name: "Pépite de soutien", price: 2, icon: "gold_nugget", stack: true,
        lore: "Aide à payer le serveur. Rien en échange, à part notre gratitude." }
    ]
  }
};
