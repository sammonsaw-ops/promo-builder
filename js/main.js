// ── Sub-module imports ───────────────────────────────────────────────────────
import { openInstructions as _openInstructions } from './instructions.js';
import {
  injectStateIntoPng, extractStateFromPng,
  fileToRecord, recordToFile,
  STATE_VERSION,
} from './state-io.js';

// Local wrapper — the markup calls onclick="openInstructions()" and the
// window bridge below re-exposes this. Passing currentLang through keeps
// instructions.js free of cross-module state.
function openInstructions() { _openInstructions(currentLang); }

// ── AUTO-PREVIEW: regenerate when any input changes (debounced 900ms) ────────
// Fires whether or not a logo has been uploaded — generatePoster decides
// between the full render and the low-fidelity placeholder based on that.
let _autoPreviewTimer = null;
function scheduleAutoPreview() {
  clearTimeout(_autoPreviewTimer);
  _autoPreviewTimer = setTimeout(() => {
    try { generatePoster(); } catch(e) { console.warn('Auto-preview skipped:', e.message); }
  }, 900);
}
// Wire auto-preview via [data-autopreview] attribute — add the attribute to
// any input/select in the markup to opt it into the debounced re-render.
// File uploads and the logo still get bespoke wiring below.
(function wireAutoPreview(){
  document.querySelectorAll('[data-autopreview]').forEach(el => {
    el.addEventListener('input', scheduleAutoPreview);
  });
  // Checkboxes: fire on change so state settles before we re-render
  document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', scheduleAutoPreview);
  });
  // Prize image: debounced preview on file selection
  const pi = document.getElementById('prizeImageUpload');
  if (pi) pi.addEventListener('change', scheduleAutoPreview);
  // Logo: fire immediately on upload (not debounced)
  const li = document.getElementById('logoUpload');
  if (li) li.addEventListener('change', () => setTimeout(generatePoster, 120));
})();

// ⌘/Ctrl+Enter to generate immediately
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(_autoPreviewTimer);
    generatePoster();
  }
});

// ── PB UI Kit — progressive enhancement of existing controls ─────────────────
// Adds ARIA roles, keyboard navigation, and screen-reader hints without
// altering any behavior wired in the HTML.
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Toggle-row → role=switch with Space/Enter to activate
    window.PB?.enhanceSwitches?.();

    // Sport & ratio grids → arrow-key navigation
    window.PB?.enhanceRadioGroup?.('#sportGrid',  { orientation: 'grid', role: 'radiogroup' });
    window.PB?.enhanceRadioGroup?.('#ratioGrid',  { orientation: 'grid', role: 'radiogroup' });

    // Mode switcher → tablist-style keyboard nav
    const modeSwitcher = document.querySelector('.mode-switcher');
    if (modeSwitcher) {
      modeSwitcher.setAttribute('role', 'tablist');
      modeSwitcher.querySelectorAll('.mode-btn').forEach(btn => {
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
      });
      // Keep aria-selected in sync when class changes
      new MutationObserver(() => {
        modeSwitcher.querySelectorAll('.mode-btn').forEach(btn => {
          btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
        });
      }).observe(modeSwitcher, { subtree: true, attributes: true, attributeFilter: ['class'] });
      window.PB?.enhanceRadioGroup?.(modeSwitcher, { orientation: 'horizontal', role: 'tablist' });
    }

    // Sport/ratio buttons → set aria-pressed to reflect selection
    const syncPressed = (root, selector) => {
      const host = document.querySelector(root);
      if (!host) return;
      host.querySelectorAll(selector).forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false'));
      new MutationObserver(() => {
        host.querySelectorAll(selector).forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false'));
      }).observe(host, { subtree: true, attributes: true, attributeFilter: ['class'] });
    };
    syncPressed('#sportGrid', '.sport-btn');
    syncPressed('#ratioGrid', '.ratio-btn');

    // Live region for status updates → announce Generate progress
    const status = document.getElementById('statusText');
    if (status) {
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
    }
  } catch (err) {
    // Progressive enhancement — never block the app if the UI kit is missing.
    console.debug('PB enhancement skipped:', err?.message);
  }

  // Filter the promo-type dropdown to the initial language (English) so the
  // user doesn't see all 9 mixed-language options on first load. Then run
  // togglePrizeImage so the visible field groups (custom text inputs vs
  // raffle-details fields) match whatever the default type resolves to —
  // in Simple mode this is 'custom', so the Custom Text inputs need to show.
  try { _rebuildTypeDropdown('en'); togglePrizeImage(); } catch (_) {}
});


// ─── State ─────────────────────────────────────────────────────────────────
let currentMode = 'simple';
let currentSport = 'hockey';
let currentRatio = '16:9';
let preloadedPrizeImg = null;
let _ticketLayout = null;   // set after each banner render; used by finaliseDownload
let currentLang = 'en';    // 'en', 'fr' or 'es' — driven by raffle type selection

// ═══════════════════════════════════════════════════════════════════════
// UI STRING TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════
const UI_STRINGS = {
  en: {
    step0Title:'Select Language', step1Title:'Banner Type', step2Title:'Output Format', step3Title:'Promo Details', step4Title:'QR Code',
    labelSelectLang:'Language',
    resetBtn:'Reset All Fields',
    resetConfirm:'Reset all fields? Your current banner will be cleared and cannot be recovered.',
    modeSimple:' Standard', modeStandard:' Raffle', modeSport:' Sport Themed Raffle',
    sportSelectorLabel:'Select Sport',
    sports:{ hockey:'Hockey', soccer:'Soccer', football:'Football', baseball:'Baseball', softball:'Softball', basketball:'Basketball', waterpolo:'Water Polo', volleyball:'Volleyball', ringette:'Ringette', curling:'Curling', gymnastics:'Gymnastics', golf:'Golf', figureskating:'Figure Skating', lacrosse:'Lacrosse', rugby:'Rugby', tennis:'Tennis', swimming:'Swimming', afl:'AFL', wrestling:'Wrestling / MMA', equestrian:'Equestrian', ultimatefrisbee:'Ultimate Frisbee', fencing:'Fencing', dance:'Dance', boxing:'Boxing', trackfield:'Track & Field' },
    ratioDims:{ '16:9':'Banner / FB Cover', '1:1':'Instagram Square', '4:5':'IG Portrait', '9:16':'Story / Reel', '1.91:1':'FB / LinkedIn Ad', 'letter':'Print Poster', 'custom':'Any size' },
    crpLabel:'Custom Size (pixels)', crpW:'Width', crpH:'Height',
    crpApply:'✓ Apply Custom Size', crpApplied:(w,h)=>`✓ Applied — ${w} × ${h}`,
    privacyNotice:'<strong>Your privacy is protected.</strong> No images, logos, or information entered into this tool are stored, saved, or transmitted. All data exists only in your browser session and is never sent to any server.',
    labelOrgName:'Organization Name', phOrgName:'e.g. Northside Hockey',
    labelRaffleType:'Promo Type',
    labelCustomMain:'Main Headline', phCustomMain:'e.g. FALL SALE',
    labelCustomSub:'Subheading', labelCustomSubHint:'(optional)', phCustomSub:'e.g. 50% OFF',
    customTextNote:'💡 <strong>Tip:</strong> Short, punchy text works best. Both lines are rendered in the same bold display style as the built-in raffle labels.',
    labelLogoUpload:'Team / Club Logo',
    logoUploadDefault:'Click Here to upload logo or image…',
    logoUploadNew:'Click Here to upload new file',
    removeLogoBtn:'✕ Remove Logo',
    bpTitle:'Extracted Brand Palette — click any swatch to edit', bpReset:'↺ Re-extract',
    bpDark:'Dark', bpPrimary:'Primary', bpAccent:'Accent', bpMid:'Mid', bpLight:'Light', bpLogoBg:'Logo BG',
    bpNote:'These colours will be applied across your generated assets. Swatches have a greater effect on Standard and Raffle banners; Sport Themed Raffle banners use sport-specific theming with accents from your palette.',
    labelPrizeImage:'Prize Image', labelPrizeImageHint:'(optional, Prize Raffle)',
    prizeUploadDefault:'Click Here to upload prize image…',
    prizeUploadNew:'Click Here to upload new file',
    removePrizeBtn:'✕ Remove Prize Image',
    prizeImageNote:'⚠️ Prize image upload is unavailable while <strong>Include Detailed Information</strong> is toggled on. Turn off the toggle to upload a prize image instead.',
    labelQrUrl:'Ticket Purchase URL', labelQrUrlHint:'(adds QR code to banner)',
    qrHint:'QR code will appear in the banner corner.<br>Leave blank to omit.',
    removeQrBtn:'✕ Remove',
    toggleLabel:'Include Detailed Information', toggleSublabel:'Dates, tickets, prize amounts, draw location',
    jurisdictionNote:'<strong>Leave this off in most cases.</strong> Detailed information is only required on raffle banners in certain jurisdictions. When in doubt, keep this toggled off.',
    detailsNote:'💡 <strong>Tip:</strong> After filling in the details below, click <strong>Generate Banner</strong> if the preview doesn\'t update automatically.',
    detailsRatioNote:'ℹ️ <strong>Tip:</strong> All detail fields will appear on your banner. Text automatically scales to fit the chosen format — wider formats will display larger, more readable text.',
    labelTicketPackages:'Ticket Packages', phTickets:'# tickets', forLabel:'for $',
    addPackageBtn:'+ Add Package', labelTotalTickets:'Total Tickets', phTotalTickets:'e.g. 1,000',
    labelMaxSales:'Maximum Possible Sales', labelPrizeDesc:'Prize Description',
    phPrizeDesc:'e.g. 2025 Ford F-150 Truck', labelPrizeValue:'Prize Value',
    labelLicence:'Licence Number', phLicence:'e.g. #:Pending',
    labelDrawDate:'Draw Date', labelDrawTime:'Draw Time',
    labelDrawLocation:'Draw Location', labelDrawLocationHint:'(full address)',
    phDrawLocation:'123 Main St, City, Province A1B 2C3',
    generateBtn:'Generate Banner',
    autoTip:'💡 <strong style="color:var(--gray-500);">Tip:</strong> The banner preview updates automatically as you make changes. If it does not refresh, click the <strong>Generate Banner</strong> button above.',
    disclaimer:'<strong style="color:var(--gray-500);">Disclaimer:</strong> This is a free tool provided by Sammons Creative at no charge. The end user is solely responsible for reviewing all banner content for accuracy, errors, and compliance before use. Sammons Creative assumes no liability for any mistakes, omissions, or inaccuracies in the generated output. Use at your own discretion.',
    previewLabel:'Preview', statusReady:'Ready to generate', statusGenerating:'Generating…', statusError:'Error — see console',
    statusBannerReady:(label,kb)=>`Banner ready · ${label} · ${kb} KB`,
    statusBannerReadyNoKb:(label)=>`Banner ready · ${label}`,
    placeholderTitle:'Your banner appears here',
    placeholderSub:'Fill in your details on the left, then click Generate Banner to create a print-ready raffle promo.',
    fileInfo:' · PNG · Ready to download',
    copyBtn:'📋 Copy', copiedBtn:'✓ Copied!', downloadBtn:'⬇ Download PNG',
    instructionsBtn:'Instructions for Use',
    alertNoLogo:'Please upload a team logo or image first.', alertNoLogoShort:'Please upload a logo/image',
    alertError:'An error occurred. Please check all required fields.',
    toastCopied:'✓ Banner copied to clipboard',
    toastCopyFail1:'Could not copy — try downloading instead.',
    toastCopyFail2:'Clipboard access denied. Use Download instead.',
    toastCopyFail3:'Could not copy — use Download instead.',
    headerReturn:'← Click here to return to Sammons Creative',
    restoreStripTitle:'Continuing an earlier banner?',
    restoreStripSub:'Re-upload the PNG you downloaded to restore every field, logo, and prize image.',
    restoreStripBtn:'Upload PNG',
    downloadReuseHint:'💾 <strong>Editable file:</strong> this PNG stores your form data. Keep the original and re-upload it here later — e.g. to swap in your approved licence number — without re-entering anything. Re-saving through other image tools may strip the embedded data.',
  },
  fr: {
    step0Title:'Choisir la langue', step1Title:'Type de bannière', step2Title:'Format de sortie', step3Title:'Détails de la promo', step4Title:'Code QR',
    labelSelectLang:'Langue',
    resetBtn:'Tout réinitialiser',
    resetConfirm:'Réinitialiser tous les champs ? Votre bannière actuelle sera effacée et ne pourra pas être récupérée.',
    modeSimple:' Standard', modeStandard:' Tirage', modeSport:' Tirage Sportif',
    sportSelectorLabel:'Choisir un sport',
    sports:{ hockey:'Hockey', soccer:'Soccer', football:'Football', baseball:'Baseball', softball:'Softball', basketball:'Basketball', waterpolo:'Water-polo', volleyball:'Volleyball', ringette:'Ringette', curling:'Curling', gymnastics:'Gymnastique', golf:'Golf', figureskating:'Patinage artistique', lacrosse:'Crosse', rugby:'Rugby', tennis:'Tennis', swimming:'Natation', afl:'AFL', wrestling:'Lutte / AMM', equestrian:'Équitation', ultimatefrisbee:'Frisbee ultime', fencing:'Escrime', dance:'Danse', boxing:'Boxe', trackfield:'Athlétisme' },
    ratioDims:{ '16:9':'Bannière / Couverture FB', '1:1':'Carré Instagram', '4:5':'Portrait IG', '9:16':'Story / Reel', '1.91:1':'Pub FB / LinkedIn', 'letter':'Affiche imprimée', 'custom':'Toutes tailles' },
    crpLabel:'Taille personnalisée (pixels)', crpW:'Largeur', crpH:'Hauteur',
    crpApply:'✓ Appliquer la taille', crpApplied:(w,h)=>`✓ Appliqué — ${w} × ${h}`,
    privacyNotice:'<strong>Votre vie privée est protégée.</strong> Aucune image, logo ou information saisie dans cet outil n\'est stockée, enregistrée ou transmise. Toutes les données existent uniquement dans votre session de navigateur et ne sont jamais envoyées à un serveur.',
    labelOrgName:'Nom de l\'organisme', phOrgName:'ex. : Hockey Northside',
    labelRaffleType:'Type de promo',
    labelCustomMain:'Titre principal', phCustomMain:'ex. : SOLDE D\'AUTOMNE',
    labelCustomSub:'Sous-titre', labelCustomSubHint:'(facultatif)', phCustomSub:'ex. : 50 % DE RABAIS',
    customTextNote:'💡 <strong>Conseil :</strong> Un texte court et percutant fonctionne le mieux. Les deux lignes sont rendues dans le même style d\'affichage gras que les libellés de tirage intégrés.',
    labelLogoUpload:'Logo de l\'équipe / club',
    logoUploadDefault:'Cliquez ici pour téléverser un logo…',
    logoUploadNew:'Cliquez ici pour téléverser un nouveau fichier',
    removeLogoBtn:'✕ Supprimer le logo',
    bpTitle:'Palette de marque — cliquez sur une couleur pour modifier', bpReset:'↺ Réextraire',
    bpDark:'Foncé', bpPrimary:'Primaire', bpAccent:'Accent', bpMid:'Milieu', bpLight:'Clair', bpLogoBg:'Fond logo',
    bpNote:'Ces couleurs seront appliquées à vos éléments générés. Les palettes ont un effet plus marqué sur les bannières Standard et de Tirage ; les bannières Sport utilisent un thème propre au sport avec des accents de votre palette.',
    labelPrizeImage:'Image du prix', labelPrizeImageHint:'(optionnel, Tirage de Prix)',
    prizeUploadDefault:'Cliquez ici pour téléverser l\'image du prix…',
    prizeUploadNew:'Cliquez ici pour téléverser un nouveau fichier',
    removePrizeBtn:'✕ Supprimer l\'image',
    prizeImageNote:'⚠️ Le téléversement de l\'image du prix n\'est pas disponible lorsque <strong>Inclure les informations détaillées</strong> est activé. Désactivez le bouton pour téléverser une image du prix.',
    labelQrUrl:'URL d\'achat de billets', labelQrUrlHint:'(ajoute un code QR à la bannière)',
    qrHint:'Le code QR apparaîtra dans le coin de la bannière.<br>Laissez vide pour omettre.',
    removeQrBtn:'✕ Supprimer',
    toggleLabel:'Inclure les informations détaillées', toggleSublabel:'Dates, billets, montants du prix, lieu du tirage',
    jurisdictionNote:'<strong>Laissez ceci désactivé dans la plupart des cas.</strong> Les informations détaillées ne sont requises sur les bannières de tirage que dans certaines juridictions. En cas de doute, gardez ce bouton désactivé.',
    detailsNote:'💡 <strong>Conseil :</strong> Après avoir rempli les détails ci-dessous, cliquez sur <strong>Générer la bannière</strong> si l\'aperçu ne se met pas à jour automatiquement.',
    detailsRatioNote:'ℹ️ <strong>Conseil :</strong> Tous les champs de détail apparaîtront sur votre bannière. Le texte se redimensionne automatiquement — les formats plus larges afficheront un texte plus grand.',
    labelTicketPackages:'Forfaits de billets', phTickets:'# billets', forLabel:'pour $',
    addPackageBtn:'+ Ajouter un forfait', labelTotalTickets:'Total de billets', phTotalTickets:'ex. : 1 000',
    labelMaxSales:'Ventes maximales possibles', labelPrizeDesc:'Description du prix',
    phPrizeDesc:'ex. : Camion Ford F-150 2025', labelPrizeValue:'Valeur du prix',
    labelLicence:'Numéro de licence', phLicence:'ex. : #:En attente',
    labelDrawDate:'Date du tirage', labelDrawTime:'Heure du tirage',
    labelDrawLocation:'Lieu du tirage', labelDrawLocationHint:'(adresse complète)',
    phDrawLocation:'123 rue Principale, Ville, Province A1B 2C3',
    generateBtn:'Générer la bannière',
    autoTip:'💡 <strong style="color:var(--gray-500);">Conseil :</strong> L\'aperçu se met à jour automatiquement. S\'il ne se rafraîchit pas, cliquez sur le bouton <strong>Générer la bannière</strong> ci-dessus.',
    disclaimer:'<strong style="color:var(--gray-500);">Avis de non-responsabilité :</strong> Cet outil est fourni gratuitement par Sammons Creative. L\'utilisateur final est seul responsable de vérifier l\'exactitude du contenu avant utilisation. Sammons Creative n\'assume aucune responsabilité pour les erreurs ou omissions dans le résultat généré.',
    previewLabel:'Aperçu', statusReady:'Prêt à générer', statusGenerating:'Génération…', statusError:'Erreur — voir la console',
    statusBannerReady:(label,kb)=>`Bannière prête · ${label} · ${kb} Ko`,
    statusBannerReadyNoKb:(label)=>`Bannière prête · ${label}`,
    placeholderTitle:'Votre bannière apparaît ici',
    placeholderSub:'Remplissez vos informations à gauche, puis cliquez sur Générer la bannière pour créer votre promo de tirage.',
    fileInfo:' · PNG · Prêt à télécharger',
    copyBtn:'📋 Copier', copiedBtn:'✓ Copié !', downloadBtn:'⬇ Télécharger PNG',
    instructionsBtn:'Guide d\'utilisation',
    alertNoLogo:'Veuillez d\'abord téléverser un logo ou une image.', alertNoLogoShort:'Veuillez téléverser un logo/image',
    alertError:'Une erreur est survenue. Vérifiez tous les champs requis.',
    toastCopied:'✓ Bannière copiée dans le presse-papiers',
    toastCopyFail1:'Impossible de copier — essayez de télécharger à la place.',
    toastCopyFail2:'Accès au presse-papiers refusé. Utilisez Télécharger.',
    toastCopyFail3:'Impossible de copier — utilisez Télécharger.',
    headerReturn:'← Cliquez ici pour revenir à Sammons Creative',
    restoreStripTitle:'Vous continuez une bannière précédente ?',
    restoreStripSub:'Retéléversez le PNG téléchargé pour restaurer tous les champs, le logo et l\'image du prix.',
    restoreStripBtn:'Téléverser un PNG',
    downloadReuseHint:'💾 <strong>Fichier modifiable :</strong> ce PNG contient les données de votre formulaire. Conservez l\'original et retéléversez-le ici plus tard — par ex. pour insérer votre numéro de licence approuvé — sans tout ressaisir. Le réenregistrement par un autre outil d\'image peut supprimer les données intégrées.',
  },
  es: {
    step0Title:'Elegir el idioma', step1Title:'Tipo de bandera', step2Title:'Formato de salida', step3Title:'Detalles de la promo', step4Title:'Código QR',
    labelSelectLang:'Idioma',
    resetBtn:'Restablecer todo',
    resetConfirm:'¿Restablecer todos los campos? Su bandera actual se borrará y no podrá recuperarse.',
    modeSimple:' Estándar', modeStandard:' Rifa', modeSport:' Rifa Deportiva',
    sportSelectorLabel:'Elegir un deporte',
    sports:{ hockey:'Hockey', soccer:'Fútbol', football:'Fútbol americano', baseball:'Béisbol', softball:'Sóftbol', basketball:'Baloncesto', waterpolo:'Waterpolo', volleyball:'Voleibol', ringette:'Ringette', curling:'Curling', gymnastics:'Gimnasia', golf:'Golf', figureskating:'Patinaje artístico', lacrosse:'Lacrosse', rugby:'Rugby', tennis:'Tenis', swimming:'Natación', afl:'AFL', wrestling:'Lucha / AMM', equestrian:'Ecuestre', ultimatefrisbee:'Ultimate', fencing:'Esgrima', dance:'Baile', boxing:'Boxeo', trackfield:'Atletismo' },
    ratioDims:{ '16:9':'Banner / Portada FB', '1:1':'Cuadrado Instagram', '4:5':'Retrato IG', '9:16':'Story / Reel', '1.91:1':'Anuncio FB / LinkedIn', 'letter':'Cartel impreso', 'custom':'Cualquier tamaño' },
    crpLabel:'Tamaño personalizado (píxeles)', crpW:'Ancho', crpH:'Alto',
    crpApply:'✓ Aplicar tamaño', crpApplied:(w,h)=>`✓ Aplicado — ${w} × ${h}`,
    privacyNotice:'<strong>Su privacidad está protegida.</strong> Ninguna imagen, logo o información ingresada en esta herramienta se almacena, guarda ni se transmite. Todos los datos existen solo en su sesión del navegador y nunca se envían a un servidor.',
    labelOrgName:'Nombre de la organización', phOrgName:'ej.: Hockey Northside',
    labelRaffleType:'Tipo de promo',
    labelCustomMain:'Titular principal', phCustomMain:'ej.: OFERTA DE OTOÑO',
    labelCustomSub:'Subtítulo', labelCustomSubHint:'(opcional)', phCustomSub:'ej.: 50% DE DESCUENTO',
    customTextNote:'💡 <strong>Consejo:</strong> El texto corto y contundente funciona mejor. Ambas líneas se muestran con el mismo estilo en negrita que las etiquetas de rifa integradas.',
    labelLogoUpload:'Logo del equipo / club',
    logoUploadDefault:'Haga clic aquí para subir un logo o imagen…',
    logoUploadNew:'Haga clic aquí para subir un nuevo archivo',
    removeLogoBtn:'✕ Quitar logo',
    bpTitle:'Paleta de marca extraída — haga clic en un color para editarlo', bpReset:'↺ Volver a extraer',
    bpDark:'Oscuro', bpPrimary:'Primario', bpAccent:'Acento', bpMid:'Medio', bpLight:'Claro', bpLogoBg:'Fondo logo',
    bpNote:'Estos colores se aplicarán a los elementos generados. Los cambios tienen mayor efecto en las Banderas Estándar y de Rifa; las Banderas Deportivas usan un tema específico del deporte con acentos de su paleta.',
    labelPrizeImage:'Imagen del premio', labelPrizeImageHint:'(opcional, Rifa con Premio)',
    prizeUploadDefault:'Haga clic aquí para subir la imagen del premio…',
    prizeUploadNew:'Haga clic aquí para subir un nuevo archivo',
    removePrizeBtn:'✕ Quitar imagen',
    prizeImageNote:'⚠️ No se puede subir la imagen del premio mientras <strong>Incluir información detallada</strong> esté activado. Desactive el interruptor para subir una imagen del premio.',
    labelQrUrl:'URL de compra de boletos', labelQrUrlHint:'(añade un código QR a la bandera)',
    qrHint:'El código QR aparecerá en la esquina de la bandera.<br>Deje en blanco para omitir.',
    removeQrBtn:'✕ Quitar',
    toggleLabel:'Incluir información detallada', toggleSublabel:'Fechas, boletos, montos del premio, lugar del sorteo',
    jurisdictionNote:'<strong>Déjelo desactivado en la mayoría de los casos.</strong> La información detallada solo es requerida en las banderas de rifa en ciertas jurisdicciones. En caso de duda, mantenga este interruptor desactivado.',
    detailsNote:'💡 <strong>Consejo:</strong> Después de llenar los detalles a continuación, haga clic en <strong>Generar bandera</strong> si la vista previa no se actualiza automáticamente.',
    detailsRatioNote:'ℹ️ <strong>Consejo:</strong> Todos los campos de detalle aparecerán en su bandera. El texto se ajusta automáticamente — los formatos más anchos mostrarán texto más grande y legible.',
    labelTicketPackages:'Paquetes de boletos', phTickets:'# boletos', forLabel:'por $',
    addPackageBtn:'+ Añadir paquete', labelTotalTickets:'Total de boletos', phTotalTickets:'ej.: 1,000',
    labelMaxSales:'Ventas máximas posibles', labelPrizeDesc:'Descripción del premio',
    phPrizeDesc:'ej.: Camioneta Ford F-150 2025', labelPrizeValue:'Valor del premio',
    labelLicence:'Número de licencia', phLicence:'ej.: #:Pendiente',
    labelDrawDate:'Fecha del sorteo', labelDrawTime:'Hora del sorteo',
    labelDrawLocation:'Lugar del sorteo', labelDrawLocationHint:'(dirección completa)',
    phDrawLocation:'123 Main St, Ciudad, Provincia A1B 2C3',
    generateBtn:'Generar bandera',
    autoTip:'💡 <strong style="color:var(--gray-500);">Consejo:</strong> La vista previa se actualiza automáticamente mientras hace cambios. Si no se refresca, haga clic en el botón <strong>Generar bandera</strong> arriba.',
    disclaimer:'<strong style="color:var(--gray-500);">Aviso legal:</strong> Esta es una herramienta gratuita proporcionada por Sammons Creative sin costo. El usuario final es el único responsable de revisar el contenido de la bandera para verificar exactitud, errores y cumplimiento antes de usarla. Sammons Creative no asume responsabilidad por errores, omisiones o inexactitudes en el resultado generado. Úsela a su discreción.',
    previewLabel:'Vista previa', statusReady:'Listo para generar', statusGenerating:'Generando…', statusError:'Error — vea la consola',
    statusBannerReady:(label,kb)=>`Bandera lista · ${label} · ${kb} KB`,
    statusBannerReadyNoKb:(label)=>`Bandera lista · ${label}`,
    placeholderTitle:'Su bandera aparecerá aquí',
    placeholderSub:'Llene sus datos a la izquierda, luego haga clic en Generar bandera para crear una promo de rifa lista para imprimir.',
    fileInfo:' · PNG · Lista para descargar',
    copyBtn:'📋 Copiar', copiedBtn:'✓ ¡Copiada!', downloadBtn:'⬇ Descargar PNG',
    instructionsBtn:'Guía de uso',
    alertNoLogo:'Primero suba el logo o imagen de un equipo.', alertNoLogoShort:'Suba un logo/imagen',
    alertError:'Ocurrió un error. Verifique todos los campos requeridos.',
    toastCopied:'✓ Bandera copiada al portapapeles',
    toastCopyFail1:'No se pudo copiar — intente descargar en su lugar.',
    toastCopyFail2:'Acceso al portapapeles denegado. Use Descargar.',
    toastCopyFail3:'No se pudo copiar — use Descargar.',
    headerReturn:'← Haga clic aquí para volver a Sammons Creative',
    restoreStripTitle:'¿Continuando una bandera anterior?',
    restoreStripSub:'Vuelva a subir el PNG que descargó para restaurar todos los campos, el logo y la imagen del premio.',
    restoreStripBtn:'Subir PNG',
    downloadReuseHint:'💾 <strong>Archivo editable:</strong> este PNG contiene los datos de su formulario. Conserve el original y súbalo aquí más adelante — por ej. para intercambiar su número de licencia aprobado — sin volver a escribir nada. Volver a guardarlo con otros programas de imagen puede eliminar los datos integrados.',
  }
};

// ─── Apply UI language ─────────────────────────────────────────────────────
function applyUILanguage(lang) {
  currentLang = lang;
  const S = UI_STRINGS[lang];

  // Step headers
  _setText('step0Title', S.step0Title);
  _setText('step1Title', S.step1Title);
  _setText('step2Title', S.step2Title);
  _setText('step3Title', S.step3Title);
  _setText('step4Title', S.step4Title);

  // Reset button label (localised)
  _setText('resetBtnLabel', S.resetBtn);

  // Mode buttons
  _setText('modeSimpleLabel', S.modeSimple);
  _setText('modeStandardLabel', S.modeStandard);
  _setText('modeSportLabel', S.modeSport);

  // Sport selector label & sport names
  _setText('sportSelectorLabel', S.sportSelectorLabel);
  document.querySelectorAll('.sport-btn[data-sport]').forEach(btn => {
    const n = btn.querySelector('.sport-name');
    if (n && S.sports[btn.dataset.sport]) n.textContent = S.sports[btn.dataset.sport];
  });

  // Ratio dims
  document.querySelectorAll('.ratio-btn[data-ratio]').forEach(btn => {
    const d = btn.querySelector('.ratio-dims');
    if (d && S.ratioDims[btn.dataset.ratio]) d.textContent = S.ratioDims[btn.dataset.ratio];
  });

  // Custom ratio panel
  _setText('crpLabel', S.crpLabel);
  _setText('crpWLabel', S.crpW);
  _setText('crpHLabel', S.crpH);
  _setText('crpApplyBtn', S.crpApply);

  // Privacy notice (innerHTML — has <strong>)
  _setHTML('privacyNotice', S.privacyNotice);

  // Form labels
  _setText('labelSelectLang', S.labelSelectLang);
  _setText('labelOrgName', S.labelOrgName);
  _setText('labelRaffleType', S.labelRaffleType);
  _setText('labelLogoUpload', S.labelLogoUpload);
  _setText('logoRemoveBtn', S.removeLogoBtn);

  // Custom promo text fields
  _setText('labelCustomMain', S.labelCustomMain);
  _setText('labelCustomSub',  S.labelCustomSub);
  _setText('labelCustomSubHint', S.labelCustomSubHint);
  _setPH('customMainText', S.phCustomMain);
  _setPH('customSubText',  S.phCustomSub);
  _setHTML('customTextNote', S.customTextNote);

  // Brand palette
  _setText('bpTitle', S.bpTitle);
  _setText('bpResetBtn', S.bpReset);
  _setText('bpLblDark', S.bpDark); _setText('bpLblPrimary', S.bpPrimary);
  _setText('bpLblAccent', S.bpAccent); _setText('bpLblMid', S.bpMid);
  _setText('bpLblLight', S.bpLight); _setText('bpLblLogoBg', S.bpLogoBg);
  _setText('bpNote', S.bpNote);

  // Prize image
  _setText('labelPrizeImage', S.labelPrizeImage);
  _setText('labelPrizeImageHint', S.labelPrizeImageHint);
  _setText('prizeRemoveBtn', S.removePrizeBtn);
  _setHTML('prizeImageNote', S.prizeImageNote);

  // Upload label spans (only if not showing a filename)
  _updateUploadSpan('logoLabel', S.logoUploadDefault);
  _updateUploadSpan('prizeLabel', S.prizeUploadDefault);

  // QR section
  _setText('labelQrUrl', S.labelQrUrl);
  _setText('labelQrUrlHint', S.labelQrUrlHint);
  _setHTML('qrHint', S.qrHint);
  _setText('qrRemoveBtn', S.removeQrBtn);

  // Toggle
  _setText('toggleLabel', S.toggleLabel);
  _setText('toggleSublabel', S.toggleSublabel);
  _setHTML('jurisdictionNote', S.jurisdictionNote);
  _setHTML('detailsNote', S.detailsNote);
  _setHTML('detailsRatioNote', S.detailsRatioNote);

  // Detail fields
  _setText('labelTicketPackages', S.labelTicketPackages);
  _setText('addPackageBtn', S.addPackageBtn);
  _setText('labelTotalTickets', S.labelTotalTickets);
  _setText('labelMaxSales', S.labelMaxSales);
  _setText('labelPrizeDesc', S.labelPrizeDesc);
  _setText('labelPrizeValue', S.labelPrizeValue);
  _setText('labelLicence', S.labelLicence);
  _setText('labelDrawDate', S.labelDrawDate);
  _setText('labelDrawTime', S.labelDrawTime);
  _setText('labelDrawLocation', S.labelDrawLocation);
  _setText('labelDrawLocationHint', S.labelDrawLocationHint);

  // Update placeholders
  _setPH('orgName', S.phOrgName);
  _setPH('totalTickets', S.phTotalTickets);
  _setPH('prizeDescription', S.phPrizeDesc);
  _setPH('licenceNumber', S.phLicence);
  _setPH('drawLocation', S.phDrawLocation);

  // Update existing package row for-labels and ticket placeholders
  document.querySelectorAll('.for-label').forEach(el => el.textContent = S.forLabel);
  document.querySelectorAll('.package-tickets').forEach(el => el.placeholder = S.phTickets);

  // Generate footer
  _setText('generateBtnLabel', S.generateBtn);
  _setHTML('autoTip', S.autoTip);
  _setHTML('disclaimerText', S.disclaimer);

  // Right panel
  _setText('previewToolbarLabel', S.previewLabel);
  const st = document.getElementById('statusText');
  if (st && (st.textContent === UI_STRINGS.en.statusReady || st.textContent === UI_STRINGS.fr.statusReady || st.textContent === UI_STRINGS.es.statusReady)) st.textContent = S.statusReady;
  _setText('placeholderTitle', S.placeholderTitle);
  _setText('placeholderSub', S.placeholderSub);
  _setText('fileInfoText', S.fileInfo);
  _setText('copyBtn', S.copyBtn);
  const dl = document.getElementById('downloadLink');
  if (dl) dl.textContent = S.downloadBtn;
  _setText('instructionsLabel', S.instructionsBtn);

  // Header return-to-site link + the new bilingual PNG-restore UI
  _setText('headerReturnLink', S.headerReturn);
  _setText('restoreStripTitle', S.restoreStripTitle);
  _setText('restoreStripSub',   S.restoreStripSub);
  _setText('restoreStripBtn',   S.restoreStripBtn);
  _setHTML('downloadReuseHint', S.downloadReuseHint);
}

function _setText(id, text) { const el = document.getElementById(id); if (el && text !== undefined) el.textContent = text; }
function _setHTML(id, html) { const el = document.getElementById(id); if (el && html !== undefined) el.innerHTML = html; }
function _setPH(id, ph)    { const el = document.getElementById(id); if (el && ph  !== undefined) el.placeholder = ph; }
function _updateUploadSpan(labelId, text) {
  const lbl = document.getElementById(labelId);
  if (!lbl) return;
  const span = lbl.querySelector('span:last-child');
  // Only replace if it still shows the default upload prompt (not a filename)
  if (span && (span.textContent.startsWith('Click Here') || span.textContent.startsWith('Cliquez ici') || span.textContent.startsWith('Haga clic'))) span.textContent = text;
}
const _scLogoImg = new Image();
_scLogoImg.src = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADYAbADASIAAhEBAxEB/8QAHQABAAMBAAMBAQAAAAAAAAAAAAYHCAUDBAkCAf/EADsQAAEEAQMCBQIEBAQGAwEAAAEAAgMEBQYHERIhCBMiMUFRYQkUMnEVI0KBUnKCkRYzU2JzoSQ0omP/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A2WiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICL1cvkaOIxVrK5O1FUo1InTWJ5XcMjY0cucT9AAqlx+8OrNV05MttptRkdSYRr3MhyF7Kw4xlot7EwtkDnObz2DiGj39uCguRFQ+O8SuLj1hj9Fao0LqbTmp7+QrUoqdpjHRHzpWxiQScjlo5J5DeDxwCfi+EBERAREQEREBERAREQEREBERAREQEREBERAREQEUC3a3c0PtjWidqfJu/O2G81sfVZ5tqf49LORwCe3LiBz25Ucx+5e7GWrMv4jYe8KEjQ6M5LUNenYcP/AAuaS0/ZxCC4EVMVvETpTF5U4TcbD5rQOWEZkEeUr9cEzR8xTRdQeO3vwO/YclWlo/P0NVaWxuo8WJvyOSrts1/Nb0v6HDkcjk8HhB1UREBERAREQEREBEVCbheKDSGjt4IdA2sbangjlZBksoJQ1lOR/HADCOXtaHAuPI478B3CC+0REBERAREQEREBERAREQEREGbvxDsrkaGyFKnTL2V8jmYYLb2ngFjY5JAw/u5jT/pX88MPiA21n2y09pbNZulp3L4qlFRkhunyYZfLaGiRsp9HqA5IJB5J7ccE3TuroXC7j6Hv6TzrXitaaCyaPjzIJGnlkjefkH/ccj2KwNuV4Vt1dJTzS4zGN1Rjmk9FjGeqUj46oD6+fs3qH3Qbd3b0FitzMHh8ljbFE5bFX6+QxGTa4Oawxytc9vW0HlrmtI4HbqDT8Kd5bJY/EY2fJZW9WoUa7euaxZlbHHG36uc4gAfuvl3s5udrLZzW0UsMl6CmydoymHnDmtmZ26gWO/TJx3DuxHb45B3V4i9s8jvdonA0cHqeLE47z23pTJC57Z2OZ6D0gjkgOJAP1+EHQt+IfZyq6PztZxiKV5jjsNoWXQOcPcCURlhI/wAysLTWewupcPDmNP5Spk8fOP5ditKHsP1HI9iPkHuPlUDujQ200P4WcjtbmNYYW7dx+JnFKKaaNtmW23rljc2IOLmkyED7c8E91Avw0sncLta4Z0rnU2ipaZGT2ZIfMa4j9w1nP+UINS613D0PouB8uqNVYrFlo58qawPOd/ljHL3f2BXCzO9+1+E03ic9mtVVsfWy9VtunFJG99h8TvZ/lMDngffj4P0KyT+IZpnA4LcTC38Pi61Gxlqs1i+6FvT58vm8mRw9uo9R5PuflaB2e2R22zGw2nW5vTNLJXcxg609nI2Iw+20ywtcBHKeXRhgIa0NIADR2QWrojX2jda4ObN6X1DRyNCD/nyseWGDtz/Ma4BzO3f1AdlELXiI2WrZg4mXX+ONgO6eqOOV8PP/AJmsMfH36uFiLwz6fit+I2roDJ2rM+Gt2LdXJV4pnRx3WV45ZWskAPqYXwsJafccj5V5eOzaTRWE22qaw0xp7H4O7TvR1520IGwRTQyBw9TG8DqDg3hwHPc88/Aa6q2a9qpHbrWIp68rBJHLG8OY9pHIcCOxBHyoTqbd/bfT+VqYi7qzHTZO5Zjqw0qkosTeZI4NaHNZz0Dk+7uAqu8CF92qPDnYw2aYL1OnkbWL8qcdbX13RxvMZB92/wA5zePp2WVtbaTxMHi9OjsVG/FYyXVNWpE2q8sdXZJLGCYzzy0jqJHB7duEG7NWb77SaWzz8Hm9bUYMhHJ5csUUcs/lPHu17o2uawj5DiOPlSu7rPSdLSbNWWtR4uHAyMD48g6y3yXg+3S7nhxPB7Dvz2VGeKfZXbqrsRmcjgtLYvDZDCQNs1rVSuI5HhrgHNkcO8gLSRy4k88FVX4ANMYTWrNTV9XUmZyjg3Vn47H3/wCdUhkseb5sghdywvIhYOSO3f6oNO6R322l1Zno8Hgta0rGQlf0RQyRSwea7/Cx0jGhx+wJ5VkL51eN3QGE263UxlzSNUYqpk6YtNgrnpbBOx5DjHx+kcdB4HseePoNRbq7t5HSHhXw+vK5Z/HczjKLajngENsWIQ8vIPIPS0PcB7EtHPZBY+sNyND6Rvx47P6jqVshK3qjpRh01lw455EMYc/jj7LlaS3r2t1Vl24jDaxovyL3mNlSzHJVlc8HjpDJmtJd9h3VLfh44qLI6Z1VuBk3vvZ+/l3U5blgl8vQyOOQ+o9/U6Xv9ekfQL1fxDtvMfPpOjuPj60cOSpWWVL8jG8GaF/IY5xHu5rwAD9Hn6AINZuIa0ucQABySfYKF5HdbbyjqjGaYfqzG2MxkrLa1erVlE7w888B/Rz0A8ccu47kKpPBnq1+6uyeT0rrVgzBxcoozmyS82az29UfmEnkkcObz9Gt+eVljTOksZP4vH6MqOnoYuLVlqnGK8jmyMgjnkAY1/PUD0t6ernkc8+6DdeoN/dn8Dnjg8lrrHMvNd0PbEyWZjHD3DpI2uY0j5BI4VhYjI4/L42vk8VdrXqNlgkgsV5BJHI0/LXDsQsz+LfYvQFLZXJag0rpqjhsphBHOx9RnR50XW1sjH8fq9JLuTyeW+/crlfhr5y9b0vq/T08z31MdarWK7XO5DDO2UPA+g/kg8fUk/JQab1fq/TOka0E+o8zVx4sP8uuyQkyTv8A8MbG8uefs0FcPT27e3eez7NP0dSwxZiQ8R0b1eanO8/RrJ2Mc49vYDusleJrX2qdufGLFqx1SK7DjqUIxde0HeW+vJAWSdJ/pPmOm9Q+R357hWdpHc7azf8A1bpOSdk2mda4LJRXaUdpjZDZaz1SQMlBAc1w78HpcC3kNPcENPqLbs6xq6A25zer7jBIzHVi+OInjzZSQ2NnPx1Pc0f3UpWfPxAHWW+HyUQH+W7K1hP3H6PUR/8AoNQUr4Lsbb3U36zm4mspDlbWLibZaZR1NbZlcREQD2DWNY/pb8cN4/St2rE34aORgizmt8Q5zfPs1qdlg6u5bE6Vru37zN/9fVbZQQvebbjA7oaItabzcLQ9zS+lbDQZKk3Hpkaf/RHyOQufs71aH2W03jNa2qWGtY2r+SndZssjj5ic5gIc7gEFrQ4fYqxFUniz0np3UOyuoslmcVBbu4fGWLGPnfyH1pOkElpHtyWN5HseO6CRac3b2+1C/Ub8RqSpZp6ciilyV8O4qxtk8wjiQ9nceW7kjkdx3JXv7d7i6J3Cp2LWjtQ1csys7pnYwOZJGe/BdG8BwB4PB44PB4JWGPBxtXU3Wp6yw+Zz+Xx+FrilJPVx8rWGzMfP8pzy5ruWs4kPT8lwPwrq2w2gseG3Ga/3IyecrZcVsVLFjIoWOYJGcte0zA9g9z2xt4BcAOTz34AX3rDcjROk8pBic3nYo8nO3qioV4ZLVpzeCeRDC1z+Ox78cdivxobczQutrlijprUda5erc+fTex8FmPg8HmKVrXjg9j27H3WOvBjr3G1Nfaz1nrOHOZfOXY4Qy3Uxc11zetzzJ1GNriznpjAHYcNIHtwvB4mruWze9+K3B2t0rq6C5WrQunt/wOxCX2Y3u4dw5gLvR0NPPYgcfXkN45bJY/EY2fJZW9WoUa7euaxZlbHHG36uc4gAfuq1t+IfZyq6PztZxiKV5jjsNoWXQOcPcCURlhI/zLh74bcai302v0nXjy//AAwZGw5DI1LFd5Ie+EHoLOQephc7s75+ij+6NDbTQ/hZyO1uY1hhbt3H4mcUoppo22ZbbeuWNzYg4uaTIQPtzwT3QX9prPYXUuHhzGn8pUyePnH8uxWlD2H6jkexHyD3Hys6+LfxG1NHUbWi9D3o7OppmmK3cheHNxo9iAR7zfQf0+578BQ78NLJ3C7WuGdK51NoqWmRk9mSHzGuI/cNZz/lCp/xpaawOlN77GK05iq2Lo/kIJfIrt6Wdbgeo8fdBv7Tu4eg8pfx+BxOuMFnMnO0sZHRvR2ZHljC5znCNzukcNJ5dwOeBzyRzDd0NEbIw7j4zX2t342pnmPjbDFNZA/OSAhsRdAO8rm8ADgfA55AHEywG2G3un7E9nA6PxGKsz131pJ6VcQy+W/9TQ9vDm88DuCCvn/vPprFaQ8Ws2n8JHPHj62Wxz4mTTvme3zI4JHAveS53qeeOSTxx3QfRDJ630Zi8rLicnq7AUcjC0OlqWMlDHMwEAguY5wcAQQRyPkL+4vWujcplIsVjNW4C9kJmudFVr5GGSV4aOSQxriSAO54Co/xzbU1NWbdT60xVCP+P4JvnzSRsHXZqAfzGu4/V0D1jn2DXAe6rX8ODL6aGU1DgbWPpt1CWtuU7j4mmZ8AHRJG1x7gAlp4Hv1E/CDWGY3F2+w2SmxmX13pfHXoCBNWtZaCKWMkAgOY54I7EHuPle9kdWaXx2mBqi7qHFw4NzBIzIOtM8h7T+kteDw7n4455+FSu92gtNbm+IHR2nX4qpKcTWly2orDGAPfX6mtr13uHd3W9ruxPIaHEe6oXxR60rZ/xH4XRE8Mo0bprIU6RxtOAua/1M87phb+p3BMbWgezeB7lBraHfXap9qnXm1UKX53vVmv0LNSCcdu7JZY2xuHcdw7juFY7HNexr2ODmuHIIPII+qzB4ntZaW3A2ZyWm8RpTV1zKtdDJjG/wDDVuMQyMe3khzowGjo62n7OIXS8BmT1odvcnpjV2Jy1KLCzxjGyX6skRdDIHExNLwOoMLf7B4HtwEGjkREBERAREQEREFR+JbVWV28x+m9w6UtmXG4nJiDMUI38Ns1bDegnj2L2ODC3n5PuOSrE0bqfA6w07V1BpvJQZHHWW8xyxO54Py1w92uHsWngg+69rP4fF5/D2cPm8fWyGPtM6J61iMPjkHPPcH6EAg/BAIVOs8Mehcfkpr2ktQ620a6Y+tmCzToWn7cua53Hf6oIH+ILgsXnKGjcdi6cdnWt7KflqUULR50tZzHB4PHctEnlcE9hy77rh+OXVWotDaL0XtvhMlYp0pMd03Z4HljrLYWsjazqHcN9yR88jlaJ0DtDozR2cm1DVgv5XUEzS1+Xy9x9y2Wn4D3nhvz3ABPPc8Lz7xbV6R3VwcGL1VWnP5V5kq2q0gjngc4AO6XEEcHgcggg8Dt2CCkMHp/ROkvApkMni346O1mtNOfbvOLRLYtSs7wl/uS1/MYZ/2+3PKiX4aVmlDc15HPNBHYdHQdGHuAcWA2A8j7cuZz+4V7bdeHDanRJdLVwb8vadG6P8xlpBYcGub0u4bwGNJBIJDQfuuTpvwp7RYPVjNQxUMncMUomgo27fmVYnA8jhoaHOHPHZ7nDt3QUZ+JPNE7XelIGyMMrMZK57Ae7QZexI+/B/2K1V4dshTyWxOh56U7Jo48FTrvLTzxJFC2N7T9w5pH9l4M5shtZndRW9Q5vSNfJZO5IZJ57diaXqJHHAa55a0ADs0AAfAC9nT20G3ensRlcTg9PHH0stA6vehgu2GiVhHBHaTlp47dTeDx25QYb8Nl6pB4zsbaksRiCXLZFkcnUOlxkhsMZwfnlzmgfutPeP2WOPw9WWSSNa6XJ1WRgnguPLjwPqeAT/YqUt8OGybeOnQVMEexFqxyP7+Yu3qPZ7bvUmOxWOz+BlydXEweRSis5GzIImf3k9Tvjqdy7jtzwgp38OC1Xfs7nqTZmGxFqCSWSMH1NY+vAGuP2JY8f6Ss97h5ShS8cD8tYtRNpVNY1JZ5uodLGxzRdZJ+3Sef2W2sDsVtZgMg3IYLTD8XaDXM82pkrURLXNLSD0yjkcE+/t7juvTj8OuyzIHw/wDAVF4fx1Pknme88fPW55dz9Tz3+UHn8U8sTfDvrSR0jGsdjCA4uHBJc0Ac/ckAfus9/hnWq7L2vKTpWixLFQljj57uYw2A4/sC9n+4Wlshs/t1kNIU9I3NPGbBUrH5ivRN6x5bH8Fv/U5IAJ4aeQPcDlczFbAbRYnI18li9HsoXa0jZYZ616zG9jmnkcFsgPx7ex+UGZ/xKJYzrrScAkaZWYyV7mc9wDLwDx9D0n/YqxdztI2txfA1pGPTsZyF3E4nHXooYeS6R0FfypmNA93AOk7fJbwO/Ct3VGx+1mqM7azuodKR5LI2ndU089yw4ntwAB5nDQPhoAA+i7G3+2+jNAvsu0jiH4ttpoEsTLk74jx7ERveWtPf3ABP1QZY/Dj1tTqW9Qbf3p2Q2Lb25Cg1x481zW9EzR9XdIjIHvwHH4Vu+O7MUMf4d8tjLMzBby1mrXqR8jqe5k8criB7kBsZ5/cfVS/WGxm1uqcyc3kdLQ18t5gl/PY+eSpN1889ZMTmgu/7iCV08NtZorHZatmJcbZy+UqjivdzN+fIzQ/+Mzvf0f6eEFa+BnbrJ6G2omyGcrvq5LP2BbNeRvS+GBremJrx7hx5c7j4DgCAeVlzSuTx9PxzTZGzcgipnWt3idzx5fD7Eoaer24JcO/t3X0aylKvksZax1tr3VrUL4JgyR0bixzS13DmkOaeCe4II+CFVzPDdsk1jWjQVQ8Djl1qw4n9yZOSfuUHt+KuaKDw8a0dNIyNrscWAuPHLnOaAP3JICz1+GdbrR3td0XzsbZmjoSxRE+p7GGwHOA+gL2c/wCYLS17Z7bu/pahpa9gJLWFx9h1irTmyFl7I3u5595OS3ueGnlo+AF6NfYXaOrkq2SpaMq0blZ7ZIZqdmeu5rmnkf8ALeOe/wAH3+UER1DFobd/dDWW0u4GOpTX8BLXs4aeEmGz+XlrRPf0P55Ja93qH6SHN9PpWa92dib+1e9Gh6GkMzZyhzV9r8aHNAtV3xSRkl/TwCB1BwcAPZ3IHHJ2drDZvbrVeo3alyuBczOuc1/8Tp3J6tgOawMaeuJ7e4aAP7Lp6V260npzLuzVKjYt5l8flOyeSuTXbfR/hEsznOa37NIH2QSxRHeTRcG4e2ec0hPI2J1+vxBK5vIimaQ+Nx+we1vP25UuRB8stutRan2H3oiu5HGzwXMbK6rkqL/SZ4HHh7QfYg8BzXDtyGnuF9ItuNxdG7g4eHJaVzlW617ep9frDZ4T8tkjPqaR/t8gkd14NzNrtC7j1GQ6u0/XvyRNLYbIJjniB7+mRpDuOe/HPH2VQu8GW0xu/mBkNViPn/64vQ+X/v5XV/8ApBaO4e7ekNIOZjm3W5rUdl3l0cHjXCa3ZlP6W9Leegc+7ncAAH39lwd2nahZ4WNVSaykptzUuEtPtNr9oonP6iyFp/q6A5rOr+ot5+VI9sNo9vtt2OdpPTterae3pkuSkzWHj5HmPJIB/wALeB9l19f6H0xr3ERYnVmNdkaEU7Z2wfmZYml4BALvLc3qHf2dyPnjsgyZ+GjkaMOV1xipbUTLtqKjNBC53DpGRmcPIHzx5jOf3Wnd/tNW9YbM6q07j2GS7bx7zWjHvJKzh7Gf3c0D+64DfDjsvHLHNBomKtNE8Pjlr37UT2uHsQ5koP8A7VsIPnZ4I9yMbtxufkcPqmcY3HZqJtaWaf0Nr2Y3Hy/M5/S31SNJPsXDngclb7zuqNOYLAvz2YzmPpYtrC/81LO0RuHHPpPPqP0A5J+FX+5nh52s1/lpcxmMHJUyk55mt4+cwPlP1c3uxzv+4t5PyV4tu/DhtPojJRZShgH5DIQuDobGSmM5jI9i1vZgP36eRx2KCnfHzuXnaundK4LTty7jcbnqj71p7Q6GWaP0dETvZzR6iXNP2B9l2MHp/ROkvApkMni346O1mtNOfbvOLRLYtSs7wl/uS1/MYZ/2+3PKu/eLavSO6uDgxeqq05/KvMlW1WkEc8DnAB3S4gjg8DkEEHgduwUZ268OG1OiS6Wrg35e06N0f5jLSCw4Nc3pdw3gMaSCQSGg/dBRP4aVmlDc15HPNBHYdHQdGHuAcWA2A8j7cuZz+4UA/EChli8QL5JI3NZNiazo3EdnAdbSR/cEf2Wn9N+FPaLB6sZqGKhk7hilE0FG3b8yrE4HkcNDQ5w547Pc4du6sjcXbbQ24deCHWOnKmV/L8iGR5dHLGD7hsjC1wB4HYHjsg9TTu7O3OobGKqYXV2LyF7KtBrUq0wmsN9PURJGzkx8Dnkv4A491hfxP3qcfjLyl19mIVoMnjTLL1elnRBXD+T9i0g/TgreWgdtNCaDrSw6R0zSxJmZ0SzRdTp3t+hlcS8j/Uo3W8PezcD5XnQtGxJK4vkktzzWHvcSSSXSPcSSSeTz3QWa9sNmu5j2xzQSs4IIDmvaR7fQghfNndDB5nw8eJCK7p5sgr17Db+J6ieJ6zyQ6FxHuP1xH547/IX0M0To7Tui8dNjtM0H0KcsvmmD8zLIxruAPQHuIYOAPS3gfZc3XG2+ldZ6m03qHPUnT3dOWXWKXBAa4kD0yDj1NDmtcB27tHwSCHobI6cyuL09Z1Fqho/4r1LMMjlxwQICWgRVmgkkNij6WAcnuHH5WGPFNic1t54nb+oWQPY2fIxZvGzuB6JT1NeeD/2yBzSPt9wvpMozuLoHSO4WGbidX4Svk6zHF8ReSySFx+WPaQ5p+vB7/PKDxbZbg6X3C0tWz+ncnXnjkiD54PMHm1XcepkjfdpB/sfccggr39Oat09qPJZShgsnDkX4t0cduWueuFkjwT5YkHpc8AcuaCS3kc8cqnaHhE2bq5EWpaOYuRh3P5afIO8r9vSGu4/1K7dN4LDabw8GHwOMq43HwDiKvWjDGN+p4Hyfk+5QdFERAREQEREBERAREQEREBERAREQEX4nlighknnkZFFG0ve97gGtaBySSfYAKN4DX2lc7kamPxuQnfPermzSMtGeFluIAEyQvkY1sreC08sJ7EH2IQSdFX2V3p2yxduxXu6nYxla3+SsWmU55KkFj/pPsNYYmO+znBdPXG5ehNFOqR6l1NQoTXQ01oDJ1Sytc7pDg1vJ6ef6v09j37FBLkVe4vezavJ5HJ46prOgbOMjMlpkrZIgG8gcsL2gSdyP0F3PI+oXQ0Nunt/rapkrWmtT1LcWLBde8xr65rtHJL3tla0hvY+rjjse6CZIqut+ILZ6tUtXJNbU31qs7YJJYIJph1uHI46GEub3HqHp5PHPK9zN747T4aTHtyGtscwZFrH15I2ySx8PALS97GlsfIIPrLeyCxUXMz2ocHgcK7NZnLU6OOAb/wDJmlAY7q/SAf6ifgDkn4XGpbj6Otalg007Ky0cxZb1VqmRpT0pLA//AJCdjPM/08+x+iCWIoJc3h2zqZy7hZdY4t12hA+e0yKTzBEGPYwtJaCOvqe0dA5d79uxXt6B3O0FrylduaV1LUvxUBzbDmvgfA3v6nska1zW+k9yOOxQTBFE6O42kblzGVYb9sfxZwbjp5cbZjr2yW9TRFM6MRv5b6hw48juOQvHq3c3ROlX2m5rMPibScxt2SClPZjpl/6BO+Jjmw88jjrLfdBMEUJ1Buxt1gocTJkdW41v8YbG/HNjl8w2WSO6WvaG8+nn+o8AcHk9l5dN7o7fajwOVz2H1XjrGLxDyy/ac8xxwEfLi8D0n4cOzvglBMUUYwWv9KZrNQ4WnkZo8jYr/mq9a5SnqPsQ/L4hMxvmN+7eVxcrvTtli7divd1OxjK1v8lYtMpzyVILH/SfYawxMd9nOCCwUVT71714XbrM6ZwhrWrl7O367A6OtJJHHVdKxssjSxpMrw13pYzqcSW9u4B4O5moNvNUay23yFvXWdwWQgzDHY3FR15q8uQdJKImiSJ7Q6NpcP1OA9DnD+oFBeyKCYvd3b/J6ydo6jmbM2oGTugkofwu02WNzf1F4MQ6WD/GeG9x37he/X3F0fLls9i35SarY09H5uVdcoz1oarPhxllY2MgjuCHHqHccjugliKL4DcDSecy9fEUMlKL1qt+bqQ2qc9Y2of+pD5rGiVvBB5Zz27+ylCAig+oN2tvcDOGZbULa8P5o03XPyk76bJx7xOstYYWPHB5a54I47rr5jW2mcXkIsbPkXWchLXNplOhWluWDD/1fKha9/R7AO44JIA7oJCijOntf6M1Bp63qDE6kx8+NpFwuTOk8v8AKke4la/h0Z+zgConN4hdnYqMt52tqrq0Vo1XSRV5pB1hrTzwxhPR6wA8+knkAngoLSRV5nt79qMHNQiyOt8az8+1jq8kXXNGQ4AtLnxtLWAgg+ojt3VgxSMliZLE9r43tDmuaeQ4H2IPyEH6REQEREBERAREQEREBERAREQEREBERAREQEREBERBHtzhTO22pxkKdq7TOHtixWqniaaPyX9TGdj6iOQO3uQs6eH7Gam0puzgdO6d1zW19t/PSszte4B8uFDWcMa7nkwvc5zWdAI6gX8tHStWIgwlq/W+K1f4e9yquLqYHSTIMtF5GmqdZrb9kNsQF9myXcuPA5BLQ3gxkEkdj2d3tRYDL3fDbcqZalkauMfXmyjoJRMK0YfSDzKG89I5ilB6vljh8FbKbjse02S2jVabXP5giJv87kcHr7ert9V5q0ENaBlevDHDDG3pZHG0Na0fQAdgEGVtxcpgIvHnoTPG9jxi4sEBbvB7TCyWSK55XXIPSC4SQdJJ9nM47EJoXM4HA+OrcXJ2cnRxuFsYfyxZkmbHWfZa2oZW9ZPSXhzJ+RzyC1/zytWogxH4bLWIq+DvdPDZSSrBknx5CdtayA2R7X04o4HNDu7uZuGt4/rIA7kcjYw9j8Or+COlqPzlW2GikSPzMc7sk6QDo/V1GDrd7foDj7ArbiIMa7puztva3YjWuIinz2E0m2jJnqtQGaSKeJlYnzWjnuOiRh6uOku7/qUy8T0GO3gx2hKm2uSr5fOtzUdiK7QeJBj6pjJkllcP+Vw4Qnh3BJbwASOFphEGUdHZjAU/xANcZLIX6MNWfGMoVLUr2iM3BHTa6Jrz2EnolbxzzyHN9+yj/wCe0xQ8Vm8ck/EuByWlLVVsVOUN/PWPIrGaCF3cGcuZOOByeoOHHIIWzkQY422wmrdG650ZU0FudV3D0ZfycUUuIld5kuNrj1OldE4u8jygD3BYQ8Nb0guIXseHfVWM0JJrfaneuN9LIZfKz2nTXq73RZQTMbHKA4AgghgcD7HrPB5Wv0QZN8UVnSUGb2Ugr0K+NwNLNfmp6EtPyBXoNngDpHwEAsiIDj6mjtzyOeQuj4z9JVm7ByX9ucPRbjb2XgyeXdiYW9NqHynhsxLOzmdRjcSO3s76lahRBnjS0+1e52X0Rqx+4+YzGexMscmOxgngbYrSOLPMbJBDA15j5a0Pe4dPSP1AKmdX63xWr/D3uVVxdTA6SZBlovI01TrNbfshtiAvs2S7lx4HIJaG8GMgkjsdxUcZjaEkklHH1Kr5TzI6GFrC/wDcgd1/W47HtNkto1Wm1z+YIib/ADuRwevt6u31QY+3pzFCXD+HHXEFtt3T+Et1/wCKX6x85lZ7TSLmvLeSH/ypPT78tI912fFDqjCZvdfY7L46299OlmjdtPlryROhrGzU4mex7Q5sZ8qThxADgxxHIC1dWghrQMr14Y4YY29LI42hrWj6ADsAvIgzB4m8fd0buLo7f7RFYZHmaKjlYqnrF6GUdMTgW9ndTSWB3fv5XHPC8vix0tquTw45K3Uqvly+Ry0GT1DFWBeRCGFoiHHdzIumBvPyIy7gclaYljjlaGyxskaHBwDhyOQQQf3BAI+4X6QZw0G/a3cibQGppdxMxldQYUxHH4ps8DZ6sh8sSMkghha8x8tAc93p6R+rjupRj9y8/r7O7m7d4jSmUwWRw1CxXx2UndwySctcyMnsAwucQ9nd3UwE9uFbtLG46jLLLSx9SrJMeZHQwtYXn6kgd17SDJfhr1loevtMNm908U6pl8Xbl8zEX8bLK6402DO1wYGuMjg88dIHJ6RwCCvZ2jyEu3nia1zJryF2Cx2po2S4S/dYIa4ha7mKt1n0Mc2NwZ0cjgxcfTnVaIM67PYN1LxFbo7lV5W0NCW6zGstTcR17k3TG+aw1x4Do2ObN6/Y+Ye57qrfDZaxFXwd7p4bKSVYMk+PITtrWQGyPa+nFHA5od3dzNw1vH9ZAHcjnbiIMRmxh7H4dX8EdLUfnKtsNFIkfmY53ZJ0gHR+rqMHW72/QHH2BWo9gMjWyOyujnwXI7UkGEp17RbJ1OjnZAwSMf8AIeDzyD3U5RAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB//9k=';

const RATIOS = {
  '16:9':   { W:1080, H:608 },
  '1:1':    { W:1080, H:1080 },
  '4:5':    { W:1080, H:1350 },
  '9:16':   { W:608,  H:1080 },
  '1.91:1': { W:1200, H:628 },
  'letter': { W:2550, H:3300 },  // 8.5"×11" @ 300 DPI — print poster
};

// ─── UI Functions ───────────────────────────────────────────────────────────
function selectRatio(btn) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentRatio = btn.dataset.ratio;
  // Hide custom panel when a standard ratio is selected
  document.getElementById('customRatioPanel').style.display = 'none';
  document.querySelectorAll('.ratio-btn').forEach(b => {
    const rect = b.querySelector('rect');
    if (!rect) return;
    if (b.classList.contains('active')) {
      rect.setAttribute('fill','rgba(37,99,235,.18)');
      rect.setAttribute('stroke','#2563eb');
    } else {
      rect.setAttribute('fill','rgba(0,0,0,0.04)');
      rect.setAttribute('stroke','#98a2b3');
    }
  });
  scheduleAutoPreview();
}

function selectCustomRatio(btn) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById('customRatioPanel');
  panel.style.display = 'block';
  updateCustomPreview();
  // Style the custom button icon
  document.querySelectorAll('.ratio-btn').forEach(b => {
    const rect = b.querySelector('rect');
    if (!rect) return;
    if (b.classList.contains('active')) {
      rect.setAttribute('fill','rgba(37,99,235,.18)');
      rect.setAttribute('stroke','#2563eb');
    } else {
      rect.setAttribute('fill','rgba(0,0,0,0.04)');
      rect.setAttribute('stroke','#98a2b3');
    }
  });
}

function updateCustomPreview() {
  const w = Math.max(1, parseInt(document.getElementById('crpW').value) || 1920);
  const h = Math.max(1, parseInt(document.getElementById('crpH').value) || 1080);
  const boxSz = 48;
  const ar = w / h;
  let rw, rh;
  if (ar >= 1) { rw = boxSz; rh = Math.round(boxSz / ar); }
  else         { rh = boxSz; rw = Math.round(boxSz * ar); }
  rw = Math.max(8, rw); rh = Math.max(8, rh);
  const rx = Math.round((boxSz - rw) / 2) + 1;
  const ry = Math.round((boxSz - rh) / 2) + 1;
  const rect = document.getElementById('crpPreviewRect');
  if (rect) { rect.setAttribute('x', rx); rect.setAttribute('y', ry); rect.setAttribute('width', rw); rect.setAttribute('height', rh); }
  const gcd = (a,b) => b===0?a:gcd(b,a%b);
  const g = gcd(w,h);
  const label = document.getElementById('crpPreviewLabel');
  const rLabel = (w/g <= 20 && h/g <= 20) ? `${w/g}:${h/g}` : `${(w/h).toFixed(2)}`;
  if (label) label.textContent = rLabel;
}

function commitCustomRatio() {
  let w = parseInt(document.getElementById('crpW').value);
  let h = parseInt(document.getElementById('crpH').value);
  w = Math.max(200, Math.min(8000, w || 1920));
  h = Math.max(200, Math.min(8000, h || 1080));
  document.getElementById('crpW').value = w;
  document.getElementById('crpH').value = h;
  RATIOS['custom'] = { W: w, H: h };
  currentRatio = 'custom';
  updateCustomPreview();
  // Visual feedback on the apply button
  const btn = document.querySelector('.crp-apply');
  const orig = btn.textContent;
  btn.textContent = UI_STRINGS[currentLang].crpApplied(w, h);
  btn.style.background = 'var(--success)';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 2200);
  // Trigger regenerate if preview is already visible
  const canvas = document.getElementById('preview');
  if (canvas && canvas.classList.contains('visible')) {
    clearTimeout(_autoPreviewTimer);
    try { generatePoster(); } catch(e) {}
  }
}

function setMode(m) {
  currentMode = m;
  document.getElementById('modeSimple').classList.toggle('active', m==='simple');
  document.getElementById('modeStandard').classList.toggle('active', m==='standard');
  document.getElementById('modeSport').classList.toggle('active', m==='sport');
  document.getElementById('sportSelectorSection').classList.toggle('visible', m==='sport');

  // Re-filter the Promo Type dropdown for the new mode. Simple mode drops
  // 50/50 and Prize since neither is meaningful on the single-shape design.
  // If the current selection is no longer available, _rebuildTypeDropdown
  // falls back to the first remaining option — we fire a change event so
  // togglePrizeImage syncs the visible field groups (custom text inputs
  // vs raffle-details fields).
  const sel = document.getElementById('raffleType');
  const prevType = sel?.value;
  const curLang = TYPE_TO_LANG[prevType] || currentLang || 'en';
  _rebuildTypeDropdown(curLang, prevType);
  if (sel && sel.value !== prevType) sel.dispatchEvent(new Event('change'));

  scheduleAutoPreview();
}

function selectSport(btn) {
  document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentSport = btn.dataset.sport;
  scheduleAutoPreview();
}

function addPackage() {
  const S = UI_STRINGS[currentLang];
  const c = document.getElementById('packageContainer');
  const r = document.createElement('div');
  r.className = 'package-row';
  r.innerHTML = `<input type="number" class="package-tickets" data-autopreview placeholder="${S.phTickets}" min="1"><span class="for-label">${S.forLabel}</span><input type="number" class="package-price" data-autopreview placeholder="0.00" min="0" step="1"><button type="button" class="remove-package" onclick="removePackage(this)">×</button>`;
  // wireAutoPreview only runs once at load — attach the listener to the new
  // package inputs so they debounce-schedule a re-render like the others.
  r.querySelectorAll('[data-autopreview]').forEach(el => {
    el.addEventListener('input', scheduleAutoPreview);
  });
  c.appendChild(r);
}
function removePackage(btn) {
  btn.parentElement.remove();
  // Trigger a debounced re-render so the preview reflects the removed row
  // without the user having to click Generate Banner.
  scheduleAutoPreview();
}

function togglePrizeImage() {
  const t = document.getElementById('raffleType').value;
  const newLang = (t === 'tirage' || t === 'tirage5050' || t === 'custom_fr') ? 'fr'
                : (t === 'esrifa' || t === 'es5050'     || t === 'custom_es') ? 'es'
                : 'en';
  if (newLang !== currentLang) applyUILanguage(newLang);
  const pig = document.getElementById('prizeImageGroup');
  const piu = document.getElementById('prizeImageUpload');
  const pds = document.getElementById('prizeDescriptionSection');
  const pvs = document.getElementById('prizeValueSection');
  const pin = document.getElementById('prizeImageNote');
  const ts = document.getElementById('toggleSwitch');
  const detailsOn = ts.classList.contains('active');
  const isCustom = (t === 'custom' || t === 'custom_fr' || t === 'custom_es');

  // Custom promo types hide the whole raffle-details apparatus (prize image,
  // Include-Detailed-Information toggle, and every field it exposes) and show
  // two free-text inputs that drive the banner headline instead.
  const ctg  = document.getElementById('customTextGroup');
  const dtw  = document.getElementById('detailsToggleWrap');
  if (ctg) ctg.style.display = isCustom ? '' : 'none';
  if (dtw) dtw.style.display = isCustom ? 'none' : '';

  if (isCustom) {
    pig.style.display='none';
    pds.style.display='none';
    pvs.style.display='none';
    if(pin) pin.style.display='none';
    piu.disabled=false;
    _syncLanguageDropdown();
    return;
  }

  if (t==='prize' || t==='tirage' || t==='esrifa') {
    pig.style.display='block';
    if (detailsOn) {
      piu.disabled=true;
      pds.style.display='block';
      pvs.style.display='block';
      if(pin) pin.style.display='block';
    } else {
      piu.disabled=false;
      pds.style.display='none';
      pvs.style.display='none';
      if(pin) pin.style.display='none';
    }
  } else {
    pig.style.display='none';
    pds.style.display='none';
    pvs.style.display='none';
    if(pin) pin.style.display='none';
    piu.disabled=false;
  }
  _syncLanguageDropdown();
}

// ── Language + promo type coordination ──────────────────────────────────
// Two visible dropdowns: #languageSelector (en/fr/es) and #raffleType (the
// 3 promo types for the active language). Switching language preserves the
// family (5050 → tirage5050 → es5050; prize → tirage → esrifa; custom →
// custom_fr → custom_es) so the user's intent survives a locale switch.
const TYPE_TO_FAMILY = {
  '5050':'5050', 'tirage5050':'5050', 'es5050':'5050',
  'prize':'prize', 'tirage':'prize', 'esrifa':'prize',
  'custom':'custom', 'custom_fr':'custom', 'custom_es':'custom',
};
const TYPE_TO_LANG = {
  '5050':'en', 'prize':'en', 'custom':'en',
  'tirage5050':'fr', 'tirage':'fr', 'custom_fr':'fr',
  'es5050':'es', 'esrifa':'es', 'custom_es':'es',
};
const FAMILY_LANG = {
  '5050':   { en:'5050',   fr:'tirage5050', es:'es5050' },
  'prize':  { en:'prize',  fr:'tirage',     es:'esrifa' },
  'custom': { en:'custom', fr:'custom_fr',  es:'custom_es' },
};

// Snapshot of every raffleType <option> before we start filtering, so we can
// rebuild the dropdown from a stable source on each language switch.
let _allTypeOptions = null;
function _snapshotTypeOptions() {
  const sel = document.getElementById('raffleType');
  if (!sel || _allTypeOptions) return;
  _allTypeOptions = Array.from(sel.options).map(o => ({
    value: o.value, text: o.textContent, lang: o.dataset.lang,
  }));
}

// Custom-type option values (one per language). Used by Simple mode which
// only exposes Custom Text — the raffle-specific headlines don't belong on
// the single-shape template.
const CUSTOM_TYPES = new Set(['custom', 'custom_fr', 'custom_es']);

function _rebuildTypeDropdown(lang, preferValue) {
  _snapshotTypeOptions();
  const sel = document.getElementById('raffleType');
  if (!sel || !_allTypeOptions) return;
  let opts = _allTypeOptions.filter(o => o.lang === lang);
  if (currentMode === 'simple') opts = opts.filter(o => CUSTOM_TYPES.has(o.value));
  sel.innerHTML = '';
  opts.forEach(({ value, text }) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = text;
    sel.appendChild(opt);
  });
  sel.value = (preferValue && opts.some(o => o.value === preferValue)) ? preferValue : opts[0]?.value || '';
}

function setLanguage(lang) {
  const sel = document.getElementById('raffleType');
  const cur = sel?.value || '5050';
  const family = TYPE_TO_FAMILY[cur] || '5050';
  const target = FAMILY_LANG[family]?.[lang] || FAMILY_LANG['5050'][lang];
  _rebuildTypeDropdown(lang, target);
  if (sel) sel.dispatchEvent(new Event('change'));
  // togglePrizeImage flips UI labels but doesn't re-render the canvas; the
  // auto-preview wiring listens for 'input' (not 'change'), so kick off a
  // re-render explicitly so the banner text updates to the new language.
  scheduleAutoPreview();
}

// Used by applyBannerState and any other programmatic path that needs to
// set a specific promo type (including switching language along the way).
function setPromoType(type) {
  const lang = TYPE_TO_LANG[type];
  if (!lang) return;
  _rebuildTypeDropdown(lang, type);
  document.getElementById('raffleType')?.dispatchEvent(new Event('change'));
  scheduleAutoPreview();
}

// Keep #languageSelector in sync with whatever language is implied by the
// current raffleType value (covers PNG restore + any code path that sets
// raffleType directly).
function _syncLanguageDropdown() {
  const val = document.getElementById('raffleType')?.value || '5050';
  const lang = TYPE_TO_LANG[val] || 'en';
  const ls = document.getElementById('languageSelector');
  if (ls && ls.value !== lang) ls.value = lang;
}

// Live character counter for the Custom Text inputs. Turns amber near the
// limit so users see it before the browser blocks further typing.
function updateCustomCounter(inputId, counterId, max) {
  const inp = document.getElementById(inputId);
  const el  = document.getElementById(counterId);
  if (!inp || !el) return;
  const n = inp.value.length;
  el.textContent = `${n} / ${max}`;
  el.style.color = n >= max ? '#b45309' : '';
}

// Full reset — reloading the page is the simplest and most reliable way
// to clear every input, uploaded file, brand palette, and cached state.
function resetAll() {
  const msg = (UI_STRINGS[currentLang] || UI_STRINGS.en).resetConfirm;
  if (window.confirm(msg)) {
    window.location.reload();
  }
}

function formatCommaNumber(input) {
  const raw = input.value.replace(/[^0-9]/g,'');
  input.value = raw === '' ? '' : parseInt(raw,10).toLocaleString('en-US');
}

function toggleAdditional() {
  const ts = document.getElementById('toggleSwitch');
  const af = document.getElementById('additionalFields');
  const t = document.getElementById('raffleType').value;
  const piu = document.getElementById('prizeImageUpload');
  const pds = document.getElementById('prizeDescriptionSection');
  const pvs = document.getElementById('prizeValueSection');
  const pin = document.getElementById('prizeImageNote');
  ts.classList.toggle('active');
  af.classList.toggle('visible');
  const detNote = document.getElementById('detailsNote');
  if (detNote) detNote.style.display = ts.classList.contains('active') ? 'block' : 'none';
  const detRatioNote = document.getElementById('detailsRatioNote');
  if (detRatioNote) detRatioNote.style.display = ts.classList.contains('active') ? 'block' : 'none';
  if (t==='prize' || t==='tirage' || t==='esrifa') {
    if (ts.classList.contains('active')) {
      piu.disabled=true;
      pds.style.display='block';
      pvs.style.display='block';
      if(pin) pin.style.display='block';
    } else {
      piu.disabled=false;
      pds.style.display='none';
      pvs.style.display='none';
      if(pin) pin.style.display='none';
    }
  }
}

function updateFileLabel(input, labelId) {
  const label = document.getElementById(labelId);
  if (!label) return;
  const span = label.querySelector('span:last-child');
  if (!span) return;
  // Determine remove button id from labelId
  const removeIdMap = {'logoLabel':'logoRemoveBtn','prizeLabel':'prizeRemoveBtn'};
  const removeBtn = document.getElementById(removeIdMap[labelId]);
  if (input.files && input.files[0]) {
    span.textContent = input.files[0].name;
    label.style.borderColor = 'var(--success)';
    label.style.color = 'var(--success)';
    label.style.background = '#f0fdf4';
    if (removeBtn) removeBtn.style.display = 'inline-block';
    // Trigger brand palette extraction when a logo is uploaded
    if (labelId === 'logoLabel') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        showBrandPaletteStrip(img);
        _warnIfCheckerboard(img, 'logo');
      };
      img.src = URL.createObjectURL(input.files[0]);
      // Hide the Banner Colors pickers — the brand palette strip takes over.
      const cc = document.getElementById('customColorSection');
      if (cc) cc.style.display = 'none';
    }
    // Check prize images too
    if (labelId === 'prizeLabel') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => _warnIfCheckerboard(img, 'prize image');
      img.src = URL.createObjectURL(input.files[0]);
    }
  } else {
    const S = UI_STRINGS[currentLang];
    span.textContent = labelId === 'prizeLabel' ? S.prizeUploadNew : S.logoUploadNew;
    label.style.borderColor = '';
    label.style.color = '';
    label.style.background = '';
    if (removeBtn) removeBtn.style.display = 'none';
    if (labelId === 'logoLabel') {
      // Logo cleared — bring the Banner Colors pickers back so the user can
      // still control the logoless-render palette.
      const cc = document.getElementById('customColorSection');
      if (cc) cc.style.display = '';
    }
  }
}

function removeUploadedFile(inputId, labelId, removeBtnId) {
  const S = UI_STRINGS[currentLang];
  const defaultText = labelId === 'prizeLabel' ? S.prizeUploadNew : S.logoUploadNew;
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  const btn = document.getElementById(removeBtnId);
  if (input) {
    // Build a completely fresh <input> — cloneNode(true) can silently carry over
    // the FileList in Chromium-based browsers, so we must avoid it entirely.
    const fresh = document.createElement('input');
    fresh.type = 'file';
    fresh.id = inputId;
    if (input.name)      fresh.name      = input.name;
    if (input.accept)    fresh.accept    = input.accept;
    if (input.className) fresh.className = input.className;
    if (input.disabled)  fresh.disabled  = true;
    input.parentNode.replaceChild(fresh, input);
    // Re-wire listeners that wireAutoPreview attached to the original element
    fresh.addEventListener('change', function(){ updateFileLabel(fresh, labelId); });
    if (inputId === 'prizeImageUpload') {
      fresh.addEventListener('change', scheduleAutoPreview);
    }
    if (inputId === 'logoUpload') {
      fresh.addEventListener('change', function(){
        clearTimeout(_autoPreviewTimer);
        generatePoster();
      });
    }
  }
  if (label) {
    const span = label.querySelector('span:last-child');
    if (span) span.textContent = defaultText;
    label.style.borderColor = ''; label.style.color = ''; label.style.background = '';
  }
  if (btn) btn.style.display = 'none';
  // Clear brand palette when logo is removed and re-show the Banner Colors
  // pickers so the user can still control the logoless-render palette.
  if (inputId === 'logoUpload') {
    hideBrandPaletteStrip();
    const cc = document.getElementById('customColorSection');
    if (cc) cc.style.display = '';
    // Reset brandPalette to the current picker values so the next render
    // isn't left holding whatever ColorThief last derived from the logo.
    if (typeof updateCustomColors === 'function') updateCustomColors();
  }
  // Clear the preview canvas so the old banner is no longer shown
  const canvas = document.getElementById('preview');
  if (canvas) canvas.classList.remove('visible');
  const placeholder = document.getElementById('previewPlaceholder');
  if (placeholder) placeholder.style.display = '';
  const dlSection = document.getElementById('downloadSection');
  if (dlSection) dlSection.classList.remove('visible');
  setStatus('', UI_STRINGS[currentLang].statusReady);
}

function removeQrUrl() {
  const input = document.getElementById('qrUrl');
  if (input) { input.value = ''; input.dispatchEvent(new Event('input')); }
  const btn = document.getElementById('qrRemoveBtn');
  if (btn) btn.style.display = 'none';
}

function setStatus(type, text) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (!dot || !txt) return;
  dot.className = 'status-dot' + (type === 'ready' ? ' ready' : '');
  txt.textContent = text;
}

// 1x1 fully-transparent PNG. Used as the img.src when no logo has been
// uploaded so the render pipeline can proceed without a real logo file.
// drawLogoOnCard checks img._synthetic and skips drawing entirely, so no
// visible marker is left in the logo slot.
const TRANSPARENT_1X1_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Compose a full 5-key brand palette from just the two colours the user
// picks in the Banner Colors section. mid/dark are shifted versions of the
// primary; light and shapefill stay white so drawLogoOnCard's white-card
// early-out keeps the banner clean when there's no logo.
function computeCustomBrandPalette(primaryHex, accentHex) {
  return {
    primary:   primaryHex,
    accent:    accentHex,
    mid:       shiftHex(primaryHex, 0.35),   // lighter
    dark:      shiftHex(primaryHex, -0.35),  // darker
    light:     '#ffffff',
    shapefill: '#ffffff',
  };
}

function shiftHex(hex, factor) {
  // factor > 0 lightens toward white, factor < 0 darkens toward black.
  const [r, g, b] = hexToRgbArr(hex);
  if (factor >= 0) {
    return _rgbToHexStr(
      Math.round(r + (255 - r) * factor),
      Math.round(g + (255 - g) * factor),
      Math.round(b + (255 - b) * factor),
    );
  }
  const f = 1 + factor; // e.g. -0.35 → 0.65 multiplier
  return _rgbToHexStr(Math.round(r * f), Math.round(g * f), Math.round(b * f));
}

// Called by the two Banner Color pickers whenever the user changes them.
// Recomputes the full palette and schedules an auto-preview so the banner
// re-renders with the new colours.
function updateCustomColors() {
  const primary = document.getElementById('customTicketColor')?.value || '#2563eb';
  const accent  = document.getElementById('customTextColor')?.value  || '#f59e0b';
  const primarySwatch = document.getElementById('customTicketSwatch');
  const accentSwatch  = document.getElementById('customTextSwatch');
  if (primarySwatch) primarySwatch.style.background = primary;
  if (accentSwatch)  accentSwatch.style.background  = accent;
  window.brandPalette = computeCustomBrandPalette(primary, accent);
  scheduleAutoPreview();
}

// Seed brandPalette from the picker defaults at page load so the first
// render (before the user touches anything) has a coherent palette.
if (!window.brandPalette) {
  window.brandPalette = computeCustomBrandPalette('#2563eb', '#f59e0b');
}

function generatePoster() {
  const S = UI_STRINGS[currentLang];
  setStatus('', S.statusGenerating);
  const btn = document.querySelector('.btn-generate');
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `⏳ ${S.statusGenerating}`;
  }
  // Show the preview skeleton if the current canvas is still empty (first paint).
  // Skipping when the canvas is already visible avoids flashing on re-renders.
  const canvasVisible = document.getElementById('preview')?.classList.contains('visible');
  if (!canvasVisible && window.PB?.Preview) {
    try { window.PB.Preview.setLoading(true, _currentAspectString()); } catch(_) {}
  }
  setTimeout(() => {
    try {
      _runGeneratePoster();
    } catch(e) {
      console.error(e);
      setStatus('', S.statusError);
      if (window.PB?.Toast) {
        window.PB.Toast.show({ title: 'Render failed', message: S.alertError, kind: 'danger', duration: 4500 });
      } else {
        alert(S.alertError);
      }
    }
    if (window.PB?.Preview) {
      try { window.PB.Preview.setLoading(false); } catch(_) {}
    }
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v14M1 8h14" stroke="white" stroke-width="2" stroke-linecap="round"/></svg> ${S.generateBtn}`;
    }
  }, 50);
}

// Best-effort aspect string ("16 / 9") for the preview skeleton box.
function _currentAspectString() {
  try {
    const btn = document.querySelector('.ratio-btn.active');
    const r = btn?.getAttribute('data-ratio') || '16:9';
    if (r === 'custom') {
      const w = +document.getElementById('crpW')?.value || 16;
      const h = +document.getElementById('crpH')?.value || 9;
      return `${w} / ${h}`;
    }
    if (r === 'letter') return '8.5 / 11';
    const [a, b] = r.split(':').map(Number);
    return (a && b) ? `${a} / ${b}` : '16 / 9';
  } catch(_) { return '16 / 9'; }
}

// ═══════════════════════════════════════════════════════════════════════
// LANGUAGE STRING HELPER
// Returns all canvas-rendered strings keyed to the raffleType value.
// English types: '5050', 'prize', 'custom'
// French types:  'tirage5050', 'tirage', 'custom_fr'
// Spanish types: 'es5050',    'esrifa', 'custom_es'
// For custom_* types the mainTxt/subTxt/bandLabel come from the two
// free-text inputs on the form; every other string is the language default.
// ═══════════════════════════════════════════════════════════════════════
function getRaffleStrings(raffleType) {
  const isFr = raffleType === 'tirage'  || raffleType === 'tirage5050' || raffleType === 'custom_fr';
  const isEs = raffleType === 'esrifa'  || raffleType === 'es5050'     || raffleType === 'custom_es';
  const isCustom = raffleType === 'custom' || raffleType === 'custom_fr' || raffleType === 'custom_es';
  let customMain = '', customSub = '';
  if (isCustom) {
    customMain = (document.getElementById('customMainText')?.value || '').trim().toUpperCase();
    customSub  = (document.getElementById('customSubText')?.value  || '').trim().toUpperCase();
  }
  const customDefaults = isFr ? { main:'VOTRE TEXTE', sub:'ICI' }
                       : isEs ? { main:'SU TEXTO',    sub:'AQUÍ' }
                       :        { main:'YOUR TEXT',   sub:'HERE' };
  const cMain = isCustom ? (customMain || customDefaults.main) : null;
  const cSub  = isCustom ? customSub : null;  // sub is optional — blank is fine
  const cBand = isCustom ? [customMain, customSub].filter(Boolean).join(' ') || customDefaults.main : null;
  if (isFr) {
    return {
      mainTxt:    isCustom ? cMain : (raffleType === 'tirage5050' ? 'MOITIÉ-MOITIÉ' : 'TIRAGE'),
      subTxt:     isCustom ? cSub  : (raffleType === 'tirage5050' ? 'TIRAGE' : 'DE PRIX'),
      bandLabel:  isCustom ? cBand : (raffleType === 'tirage5050' ? 'TIRAGE MOITIÉ-MOITIÉ' : 'TIRAGE DE PRIX'),
      thankYou:   'MERCI POUR VOTRE SOUTIEN !',
      pkgTitle:   'Forfaits de billets',
      ticketSg:   'billet',
      ticketPl:   'billets',
      totalTkts:  tt  => `${tt} billets disponibles`,
      prize5050:  amt => `Prix : ${amt} (50 % des ventes)`,
      maxSales:   amt => `Max. ${amt} vendus`,
      winnerGets: (pd, pv) => pv ? `Le gagnant recevra ${pd} d'une valeur de ${pv}` : pd,
      drawLabel:  'Tirage :',
      drawOn:     'le',
      locale:     'fr-CA',
      scanQR:     'Scannez pour acheter',
      orgFallback:  'Votre organisme',
      teamFallback: 'Votre équipe',
    };
  }
  if (isEs) {
    return {
      mainTxt:    isCustom ? cMain : (raffleType === 'es5050' ? '50/50' : 'RIFA'),
      subTxt:     isCustom ? cSub  : (raffleType === 'es5050' ? 'RIFA'  : 'CON PREMIO'),
      bandLabel:  isCustom ? cBand : (raffleType === 'es5050' ? 'RIFA 50/50' : 'RIFA CON PREMIO'),
      thankYou:   '¡GRACIAS POR SU APOYO!',
      pkgTitle:   'Paquetes de boletos',
      ticketSg:   'boleto',
      ticketPl:   'boletos',
      totalTkts:  tt  => `${tt} boletos disponibles en total`,
      prize5050:  amt => `Premio: ${amt} (50 % de las ventas)`,
      maxSales:   amt => `Premio máx. con ${amt} vendidos`,
      winnerGets: (pd, pv) => pv ? `El ganador recibirá ${pd} con un valor de ${pv}` : pd,
      drawLabel:  'Sorteo:',
      drawOn:     'el',
      locale:     'es-US',
      scanQR:     'Escanee para comprar',
      orgFallback:  'Su organización',
      teamFallback: 'Su equipo',
    };
  }
  return {
    mainTxt:    isCustom ? cMain : (raffleType === '5050' ? '50/50' : 'PRIZE'),
    subTxt:     isCustom ? cSub  : 'RAFFLE',
    bandLabel:  isCustom ? cBand : (raffleType === '5050' ? '50/50 RAFFLE' : 'PRIZE RAFFLE'),
    thankYou:   'THANK YOU FOR YOUR SUPPORT',
    pkgTitle:   'Ticket Packages',
    ticketSg:   'ticket',
    ticketPl:   'tickets',
    totalTkts:  tt  => `${tt} total tickets available`,
    prize5050:  amt => `Prize: ${amt} (50% of sales)`,
    maxSales:   amt => `Max prize at ${amt} sold`,
    winnerGets: (pd, pv) => pv ? `Winner will receive ${pd} valued at ${pv}` : pd,
    drawLabel:  'Draw:',
    drawOn:     'on',
    locale:     'en-US',
    scanQR:     'Scan to buy tickets',
    orgFallback:  'Your Organization',
    teamFallback: 'Your Team',
  };
}

// ─── fitMainFontSz ────────────────────────────────────────────────────────────
// Shrinks the letter-spaced Impact headline until it fits within maxW. Returns
// { sz, lts } so callers can draw with the fitted letter-spacing — otherwise a
// long Custom string like "THE BEST AWARDS DINNER EVER" gets crushed against a
// fixed lts (e.g. 8px) that eats most of the available width at small sizes.
// Callers used to receive just a number; the object return is a shape they can
// destructure without breaking the old lts variable in their draw loops.
function fitMainFontSz(ctx, text, ltsInput, maxW, startSz, minSz = 10) {
  const startEff = Math.max(minSz, startSz);
  let sz = startEff;
  while (true) {
    ctx.font = `bold ${sz}px Impact,"Arial Black",sans-serif`;
    const lts = ltsInput * (sz / startEff);
    const chars = text.split('');
    const w = chars.reduce((s, l) => s + ctx.measureText(l).width + lts, 0) - lts;
    if (w <= maxW || sz <= minSz) return { sz, lts };
    sz = Math.max(minSz, Math.round(sz * 0.90));
  }
}

// ─── fitBoldFontSz ────────────────────────────────────────────────────────────
// Same shrink-until-it-fits pattern for the Helvetica bold sub-headline. Sub
// text was previously drawn at a fixed size so long Custom Text subheadings
// bled past the message zone / canvas edge. Returns the largest size that
// actually fits (or minSz if nothing does).
function fitBoldFontSz(ctx, text, maxW, startSz, minSz = 10) {
  let sz = Math.max(minSz, startSz);
  while (true) {
    ctx.font = `bold ${sz}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
    if (ctx.measureText(text).width <= maxW || sz <= minSz) return sz;
    sz = Math.max(minSz, Math.round(sz * 0.92));
  }
}




// ── SPORT GFX PRIMITIVES ────────────────────────────────────────────────
// Shared canvas helpers used across the sport drawXxxBg functions. Each
// primitive is a self-contained routine that saves/restores ctx state
// where relevant so callers don't have to. Extracted from patterns that
// recurred verbatim across ~15 sports.
const gfx = {
  // Full-canvas vertical linear gradient. stops is [[offset, color], ...].
  linearFill(ctx, W, H, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  },

  // Horizontal line texture overlay (subtle striations). Opts:
  //   color, alpha (default 0.06), lineWidth (default 1), step (default 22)
  horizontalTexture(ctx, W, H, opts) {
    const { color, alpha = 0.06, lineWidth = 1, step = 22 } = opts;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    for (let y = 0; y < H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  },

  // Alternating vertical stripes covering the full canvas.
  // colors is [colorA, colorB, ...]; stripes cycle through the array.
  vStripes(ctx, W, H, count, colors) {
    const sw = W / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(i * sw, 0, sw, H);
    }
  },

  // Wood-grain row texture (used for basketball/volleyball floor).
  // opts: base (starting shade), step (shade increment per row),
  //       rowH (row height px), tint {r,g,b} multipliers, rOffset
  woodTexture(ctx, W, H, opts) {
    const { base, step, rowH, tint, rOffset = 0 } = opts;
    for (let i = 0; i < H / rowH; i++) {
      const s = base + (i % 3) * step;
      const r = Math.min(255, s + rOffset);
      const g = Math.round(s * tint.g);
      const b = Math.round(s * tint.b);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, i * rowH, W, rowH - 1);
    }
  },

  // Wavy horizontal lines (water surface). Opts:
  //   color, alpha, lineWidth, step (spacing), amp (wave amplitude),
  //   cycles (sine cycles across width), startY (first wave), xStep (line detail)
  waves(ctx, W, H, opts) {
    const { color, alpha = 0.12, lineWidth = 2, step = 38, amp = 5, cycles = 10, startY = 0, xStep = 8 } = opts;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    for (let y = startY; y < H; y += step) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += xStep) {
        const wy = y + Math.sin((x / W) * Math.PI * cycles) * amp;
        x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

// ── SWIMMING ────────────────────────────────────────────────────────────
function drawSwimmingBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0, '#1056a8'], [1, '#1a3a8a']]);
  const lanes=8;
  for(let i=1;i<lanes;i++){
    const lx=W*(i/lanes);
    ctx.strokeStyle=i%2===0?'#e8901e':'#c85010'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,H); ctx.stroke();
    ctx.fillStyle=i%2===0?'#e8901e':'#c85010';
  }
  gfx.waves(ctx, W, H, { color: '#90d8f0', alpha: 0.12, lineWidth: 2, step: 38, amp: 5, cycles: 10, xStep: 8 });
  ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=5;
  [[0,H*0.33],[0,H*0.67],[W,H*0.33],[W,H*0.67]].forEach(([bx,by])=>{
    const dir=bx===0?1:-1;
    ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+dir*W*0.1,by); ctx.stroke();
  });
}
function fillSwimming(ctx,x,y,w,h){
  // Pool base
  const g=ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0,'#0d47a1'); g.addColorStop(0.5,'#1565c0'); g.addColorStop(1,'#0a3880');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Lane dividers — vertical coloured lane ropes
  const laneCount=6, laneW=w/laneCount;
  const laneColors=['#ffca28','#ef5350','#ffca28','#ef5350','#ffca28','#ef5350'];
  ctx.save(); ctx.globalAlpha=0.45; ctx.lineCap='round';
  for(let i=1;i<laneCount;i++){
    const lx=x+i*laneW;
    ctx.strokeStyle=laneColors[i%6]; ctx.lineWidth=3;
    ctx.setLineDash([5,4]); ctx.beginPath(); ctx.moveTo(lx,y+h*0.05); ctx.lineTo(lx,y+h*0.95); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
  // Lane pool floor tile lines (horizontal)
  ctx.save(); ctx.globalAlpha=0.12; ctx.strokeStyle='#90caf9'; ctx.lineWidth=0.8;
  for(let i=0;i<6;i++){
    const tly=y+h*(0.18+i*0.13);
    ctx.beginPath(); ctx.moveTo(x,tly); ctx.lineTo(x+w,tly); ctx.stroke();
  }
  ctx.restore();
  // Black lane-bottom centre markers
  ctx.save(); ctx.globalAlpha=0.30; ctx.strokeStyle='#000'; ctx.lineWidth=2;
  for(let i=0;i<laneCount;i++){
    const mx=x+i*laneW+laneW/2;
    ctx.beginPath(); ctx.moveTo(mx,y+h*0.15); ctx.lineTo(mx,y+h*0.85); ctx.stroke();
  }
  ctx.restore();
  // Backstroke flags (coloured triangle flags near top)
  ctx.save(); ctx.globalAlpha=0.55;
  const flagColors=['#e53935','#1e88e5','#43a047','#fdd835','#e53935','#1e88e5'];
  ctx.lineWidth=1.2;
  for(let i=0;i<laneCount+1;i++){
    const fx=x+i*laneW;
    ctx.strokeStyle='rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(fx,y+h*0.05); ctx.lineTo(fx,y+h*0.22); ctx.stroke();
  }
  for(let i=0;i<laneCount;i++){
    const fx=x+i*laneW+laneW/2, fy=y+h*0.07;
    ctx.fillStyle=flagColors[i%6];
    ctx.beginPath(); ctx.moveTo(fx-laneW*0.22,fy); ctx.lineTo(fx+laneW*0.22,fy); ctx.lineTo(fx,fy+h*0.10); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Water shimmer overlay
  ctx.save(); ctx.globalAlpha=0.12; ctx.strokeStyle='#90d8f0'; ctx.lineWidth=1;
  for(let i=0;i<4;i++){
    const wy=y+h*(0.3+i*0.17);
    ctx.beginPath();
    for(let px=x;px<=x+w;px+=6){const rp=wy+Math.sin((px-x)/w*Math.PI*10+i)*2.5; px===x?ctx.moveTo(px,rp):ctx.lineTo(px,rp);}
    ctx.stroke();
  }
  ctx.restore();
  const sheen=ctx.createRadialGradient(x+w*0.3,y+h*0.2,5,x+w*0.3,y+h*0.2,w*0.5);
  sheen.addColorStop(0,'rgba(255,255,255,0.18)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillSwimmingLeft=fillSwimming, fillSwimmingRight=fillSwimming;

// ── AFL background ────────────────────────────────────────────────────────────
function drawAFLBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0,'#2d7a2d'],[0.5,'#3a8a3a'],[1,'#2d7a2d']]);
  ctx.save(); ctx.globalAlpha=0.06;
  for(let i=0;i<20;i++){ctx.fillStyle=i%2?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.3)';ctx.fillRect(i*(W/20),0,W/20,H);}
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,0.88)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.ellipse(W/2,H/2,W*0.46,H*0.43,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2,H/2,H*0.16,0,Math.PI*2); ctx.stroke();
  ctx.lineWidth=2.5; ctx.strokeRect(W/2-W*0.12,H/2-H*0.16,W*0.24,H*0.32);
  ctx.save(); ctx.globalAlpha=0.65;
  ctx.beginPath(); ctx.arc(W*0.12,H/2,H*0.33,-Math.PI/2.5,Math.PI/2.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(W*0.88,H/2,H*0.33,Math.PI-Math.PI/2.5,Math.PI+Math.PI/2.5); ctx.stroke();
  ctx.restore();
  ctx.strokeRect(W*0.02,H*0.38,W*0.07,H*0.24);
  ctx.strokeRect(W*0.91,H*0.38,W*0.07,H*0.24);
  function drawGoalPosts2(bx,dir){
    ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=2.5;
    [-2.4,-0.9,0.9,2.4].forEach(o=>{const px=bx+dir*W*0.024*o;ctx.beginPath();ctx.moveTo(px,H*0.06);ctx.lineTo(px,H*0.38);ctx.stroke();});
  }
  drawGoalPosts2(W*0.07,1); drawGoalPosts2(W*0.93,-1);
}
// ── AFL / AUSSIE RULES ─── with uprights + faint Australian flag fill
function _drawAusFlag(ctx, x, y, w, h, alpha) {
  ctx.save(); ctx.globalAlpha=alpha;
  // Blue field
  ctx.fillStyle='#00247d'; ctx.fillRect(x,y,w,h);
  // Union Jack (top-left quarter)
  const qw=w*0.5, qh=h*0.5;
  // Red diagonals
  ctx.strokeStyle='#cf142b'; ctx.lineWidth=Math.max(h*0.07,2);
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+qw,y+qh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+qw,y); ctx.lineTo(x,y+qh); ctx.stroke();
  // White diagonals (slightly narrower)
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=Math.max(h*0.045,1.5);
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+qw,y+qh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+qw,y); ctx.lineTo(x,y+qh); ctx.stroke();
  // White cross
  ctx.lineWidth=Math.max(h*0.10,3);
  ctx.beginPath(); ctx.moveTo(x+qw/2,y); ctx.lineTo(x+qw/2,y+qh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y+qh/2); ctx.lineTo(x+qw,y+qh/2); ctx.stroke();
  // Red cross (centred, narrower)
  ctx.strokeStyle='#cf142b'; ctx.lineWidth=Math.max(h*0.055,2);
  ctx.beginPath(); ctx.moveTo(x+qw/2,y); ctx.lineTo(x+qw/2,y+qh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x,y+qh/2); ctx.lineTo(x+qw,y+qh/2); ctx.stroke();
  // Commonwealth star (lower left)
  function drawFlagStar(scx,scy,sr,pts){
    ctx.fillStyle='#fff'; ctx.beginPath();
    for(let i=0;i<pts*2;i++){const a=(i*Math.PI/pts)-Math.PI/2,r2=i%2===0?sr:sr*0.42;ctx.lineTo(scx+Math.cos(a)*r2,scy+Math.sin(a)*r2);}
    ctx.closePath(); ctx.fill();
  }
  drawFlagStar(x+qw*0.38,y+qh*1.55,Math.min(w,h)*0.075,7);
  // Southern Cross (right half)
  [[0.80,0.28,0.050,5],[0.68,0.52,0.038,5],[0.88,0.58,0.038,5],[0.78,0.76,0.038,5],[0.62,0.35,0.022,4]].forEach(([fx,fy,fr,pts])=>{
    drawFlagStar(x+w*fx,y+h*fy,Math.min(w,h)*fr,pts);
  });
  ctx.restore();
}
function fillAFL(ctx,x,y,w,h){
  // Green field base
  ctx.fillStyle='#4a8030'; ctx.fillRect(x,y,w,h);
  // Australian flag — very faint fill
  _drawAusFlag(ctx,x,y,w,h,0.08);
  // Grass stripe overlay on top of flag
  ctx.save(); ctx.globalAlpha=0.12; ctx.strokeStyle='#2a5010'; ctx.lineWidth=0.8;
  for(let i=0;i<10;i++){ctx.beginPath();ctx.moveTo(x+i*(w/10),y);ctx.lineTo(x+i*(w/10),y+h);ctx.stroke();}
  ctx.restore();
  // AFL uprights on both ends
  function drawAFLUprights(ux, flip) {
    const d=flip?-1:1;
    const postSpace=w*0.06, tallH=h*0.38, shortH=h*0.24;
    const postW=1.5, yBase=y+h*0.05;
    ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=postW;
    // Inner tall posts
    [-1,1].forEach(s=>{
      ctx.beginPath();
      ctx.moveTo(ux+d*s*postSpace,yBase+tallH);
      ctx.lineTo(ux+d*s*postSpace,yBase);
      ctx.stroke();
    });
    // Outer short posts
    [-2.5,2.5].forEach(s=>{
      ctx.beginPath();
      ctx.moveTo(ux+d*s*postSpace,yBase+shortH);
      ctx.lineTo(ux+d*s*postSpace,yBase);
      ctx.stroke();
    });
    // Crossbar connecting the two inner posts
    ctx.beginPath();
    ctx.moveTo(ux-d*postSpace,yBase+tallH*0.55);
    ctx.lineTo(ux+d*postSpace,yBase+tallH*0.55);
    ctx.stroke();
  }
  drawAFLUprights(x+w*0.12, false);
  drawAFLUprights(x+w*0.88, true);
}
const fillAFLLeft=fillAFL, fillAFLRight=fillAFL;

// ── WRESTLING / MMA ─────────────────────────────────────────────────────
function drawWrestlingBg(ctx, W, H) {
  // Canvas floor — off-white with faint cross-weave grain
  ctx.fillStyle='#e8dfc8'; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.globalAlpha=0.07; ctx.strokeStyle='#8a7050'; ctx.lineWidth=0.8;
  for(let xi=0;xi<W;xi+=10){ctx.beginPath();ctx.moveTo(xi,0);ctx.lineTo(xi,H);ctx.stroke();}
  for(let yi=0;yi<H;yi+=10){ctx.beginPath();ctx.moveTo(0,yi);ctx.lineTo(W,yi);ctx.stroke();}
  ctx.restore();
  // Octagon cage outline — white
  const cx=W/2,cy=H/2,r=Math.min(W,H)*0.44;
  function drawOct(radius, strokeStyle, lineWidth){
    ctx.strokeStyle=strokeStyle; ctx.lineWidth=lineWidth;
    ctx.beginPath();
    for(let i=0;i<8;i++){const a=(i*Math.PI/4)-Math.PI/8;i===0?ctx.moveTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius):ctx.lineTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);}
    ctx.closePath(); ctx.stroke();
  }
  drawOct(r,'rgba(60,30,10,0.80)',3.5);
  drawOct(r*0.86,'rgba(180,30,10,0.55)',2);
  // Center circle
  ctx.strokeStyle='rgba(60,30,10,0.40)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(cx,cy,r*0.18,0,Math.PI*2); ctx.stroke();
  // Boxing ring ropes — 3 horizontal ropes spanning full width
  const ropeYs = [H*0.25, H*0.48, H*0.71];
  const postW=12, postH=H*0.58, postY=(H-postH)/2;
  // Corner posts (left and right)
  [[W*0.04,postY],[W*0.96-postW,postY]].forEach(([px,py])=>{
    const pg=ctx.createLinearGradient(px,py,px+postW,py);
    pg.addColorStop(0,'#888'); pg.addColorStop(0.4,'#ddd'); pg.addColorStop(1,'#999');
    ctx.fillStyle=pg; ctx.fillRect(px,py,postW,postH);
    ctx.strokeStyle='#555'; ctx.lineWidth=0.5; ctx.strokeRect(px,py,postW,postH);
  });
  // Ropes
  const ropeColors=['#e82020','#e82020','#1a1a1a'];
  ropeYs.forEach((ry,ri)=>{
    ctx.save();
    // Shadow
    ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowBlur=3; ctx.shadowOffsetY=2;
    ctx.strokeStyle=ropeColors[ri]; ctx.lineWidth=5; ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(W*0.04+postW,ry); ctx.lineTo(W*0.96-postW,ry); ctx.stroke();
    // Highlight stripe on rope
    ctx.shadowColor='transparent'; ctx.strokeStyle='rgba(255,255,255,0.30)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(W*0.04+postW,ry-1); ctx.lineTo(W*0.96-postW,ry-1); ctx.stroke();
    ctx.restore();
  });
}
function fillWrestling(ctx,x,y,w,h){
  // Boxing ring canvas — off-white stretched canvas texture
  const cg=ctx.createLinearGradient(x,y,x+w,y+h);
  cg.addColorStop(0,'#f2ece0'); cg.addColorStop(0.5,'#ede5d2'); cg.addColorStop(1,'#e8dfc8');
  ctx.fillStyle=cg; ctx.fillRect(x,y,w,h);
  // Canvas weave grain
  ctx.save(); ctx.globalAlpha=0.08; ctx.strokeStyle='#9a8060'; ctx.lineWidth=0.6;
  for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo(x+i*(w/14),y);ctx.lineTo(x+i*(w/14),y+h);ctx.stroke();}
  for(let j=0;j<12;j++){ctx.beginPath();ctx.moveTo(x,y+j*(h/12));ctx.lineTo(x+w,y+j*(h/12));ctx.stroke();}
  ctx.restore();
  // Octagon guide lines (faint, centred)
  ctx.save(); ctx.globalAlpha=0.10; ctx.strokeStyle='#5a3010'; ctx.lineWidth=1.2;
  const ocx=x+w/2, ocy=y+h/2, or2=Math.min(w,h)*0.42;
  ctx.beginPath();
  for(let i=0;i<8;i++){const a=(i*Math.PI/4)-Math.PI/8;i===0?ctx.moveTo(ocx+Math.cos(a)*or2,ocy+Math.sin(a)*or2):ctx.lineTo(ocx+Math.cos(a)*or2,ocy+Math.sin(a)*or2);}
  ctx.closePath(); ctx.stroke();
  ctx.restore();
  // ── RING ROPES around the edge ──
  // Corner posts — small grey cylinders at each corner
  const postSize=Math.min(w,h)*0.055;
  [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([px,py])=>{
    const pg=ctx.createRadialGradient(px,py,postSize*0.1,px,py,postSize*0.8);
    pg.addColorStop(0,'#cccccc'); pg.addColorStop(1,'#666666');
    ctx.fillStyle=pg;
    ctx.beginPath(); ctx.arc(px,py,postSize*0.55,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#444'; ctx.lineWidth=0.8; ctx.beginPath(); ctx.arc(px,py,postSize*0.55,0,Math.PI*2); ctx.stroke();
  });
  // 3 horizontal ropes (top) and 3 vertical ropes (sides), evenly spaced
  const margin=postSize*0.55;
  const ropeColors2=['#c0392b','#c0392b','#1a1a1a'];
  // Top ropes — horizontal
  [0.28,0.50,0.72].forEach((t,ri)=>{
    const ry=y+h*t;
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=3; ctx.shadowOffsetY=2;
    ctx.strokeStyle=ropeColors2[ri]; ctx.lineWidth=Math.max(3,h*0.025); ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(x+margin,ry); ctx.lineTo(x+w-margin,ry); ctx.stroke();
    ctx.shadowColor='transparent'; ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(x+margin,ry-1); ctx.lineTo(x+w-margin,ry-1); ctx.stroke();
    ctx.restore();
  });
  // Side ropes — vertical
  [0.28,0.50,0.72].forEach((t,ri)=>{
    const rx=x+w*t;
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=3; ctx.shadowOffsetX=2;
    ctx.strokeStyle=ropeColors2[ri]; ctx.lineWidth=Math.max(3,w*0.025); ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(rx,y+margin); ctx.lineTo(rx,y+h-margin); ctx.stroke();
    ctx.shadowColor='transparent'; ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(rx-1,y+margin); ctx.lineTo(rx-1,y+h-margin); ctx.stroke();
    ctx.restore();
  });
  // Red corner pads
  const ps=Math.min(w,h)*0.14;
  ctx.save();
  ctx.fillStyle='rgba(210,20,10,0.30)';
  ctx.fillRect(x,y,ps,ps); ctx.fillRect(x+w-ps,y,ps,ps);
  ctx.fillRect(x,y+h-ps,ps,ps); ctx.fillRect(x+w-ps,y+h-ps,ps,ps);
  ctx.restore();
}
const fillWrestlingLeft=fillWrestling, fillWrestlingRight=fillWrestling;

// ── EQUESTRIAN ──────────────────────────────────────────────────────────
function drawEquestrianBg(ctx, W, H) {
  // Deep chestnut brown arena — like a chestnut horse's coat
  gfx.linearFill(ctx, W, H, [[0,'#7a2e0a'],[0.35,'#8f3810'],[0.65,'#9a3f12'],[1,'#6a2608']]);
  // Subtle wood-grain texture (no dots)
  ctx.save(); ctx.globalAlpha=0.06; ctx.strokeStyle='#3a1206'; ctx.lineWidth=1.2;
  for(let i=0;i<18;i++){ctx.beginPath();ctx.moveTo(i*(W/18),0);ctx.bezierCurveTo(i*(W/18)+8,H*0.3,i*(W/18)-8,H*0.7,i*(W/18)+4,H);ctx.stroke();}
  ctx.restore();
  // Dressage arena boundary
  ctx.strokeStyle='rgba(255,220,160,0.88)'; ctx.lineWidth=2.5;
  ctx.strokeRect(W*0.05,H*0.07,W*0.9,H*0.86);
  ctx.beginPath(); ctx.moveTo(W/2,H*0.07); ctx.lineTo(W/2,H*0.93); ctx.stroke();
  // Quarter markers (short lines on sides only)
  ctx.strokeStyle='rgba(255,220,160,0.55)'; ctx.lineWidth=1.5;
  [[W*0.05,H*0.38,W*0.14,H*0.38],[W*0.86,H*0.38,W*0.95,H*0.38],[W*0.05,H*0.62,W*0.14,H*0.62],[W*0.86,H*0.62,W*0.95,H*0.62]].forEach(([x1,y1,x2,y2])=>{
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  });
  // NO letter markers per request
}
function fillEquestrian(ctx,x,y,w,h){
  // Rich chestnut/bay horse base coat
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#7a2e10'); g.addColorStop(0.35,'#8f3810'); g.addColorStop(0.65,'#9a4012'); g.addColorStop(1,'#6a2408');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // ── Horse hair — fine flowing strands in a consistent direction ──
  // Primary direction: slight diagonal left-to-right (natural coat direction)
  ctx.save(); ctx.lineCap='round';
  // Dense short hair strands
  const hairCount=55;
  for(let i=0;i<hairCount;i++){
    // Distributed pseudo-randomly across the surface
    const hx=x+((i*137+23)%Math.round(w));
    const hy=y+((i*113+57)%Math.round(h));
    const len=Math.min(w,h)*(0.06+((i*41)%10)*0.008);
    const angle=0.18+((i*17)%8)*0.04; // slight diagonal variation
    ctx.globalAlpha=0.22+((i%5)*0.04);
    ctx.strokeStyle=i%3===0?'#5a1f08':i%3===1?'#c07040':'#8a3a15';
    ctx.lineWidth=0.7+((i%3)*0.25);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(
      hx+Math.cos(angle)*len*0.5, hy+Math.sin(angle)*len*0.3,
      hx+Math.cos(angle)*len, hy+Math.sin(angle+0.15)*len
    );
    ctx.stroke();
  }
  // Mane-like highlight strands (lighter, silkier)
  for(let i=0;i<20;i++){
    const hx=x+((i*173+41)%Math.round(w));
    const hy=y+((i*89+29)%Math.round(h));
    const len=Math.min(w,h)*(0.08+((i*31)%8)*0.01);
    ctx.globalAlpha=0.12+((i%4)*0.03);
    ctx.strokeStyle='#d08050';
    ctx.lineWidth=0.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.bezierCurveTo(
      hx+len*0.35,hy-len*0.1, hx+len*0.7,hy+len*0.2, hx+len,hy+len*0.12
    );
    ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.restore();
  // Subtle sheen — the gloss of a healthy coat
  const sheen=ctx.createRadialGradient(x+w*0.3,y+h*0.25,5,x+w*0.35,y+h*0.35,w*0.55);
  sheen.addColorStop(0,'rgba(220,160,80,0.30)'); sheen.addColorStop(0.4,'rgba(180,100,40,0.10)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillEquestrianLeft=fillEquestrian, fillEquestrianRight=fillEquestrian;



// ═══════════════════════════════════════════════════════════════════════
// NEW FEATURES: QR Code · Copy to Clipboard · Save/Load · Size Guide
// ═══════════════════════════════════════════════════════════════════════

// ── QR CODE PREVIEW & RENDER ────────────────────────────────────────────────
let _qrInstance = null;

// ── DOM cache & form-state reader ───────────────────────────────────────────
// dom(id) memoizes document.getElementById so repeated lookups in a render
// don't re-walk the DOM. readFormState() is the single source of truth for
// form → data — every renderer/exporter reads through here rather than
// scattering document.getElementById calls across the render path.
const _domCache = new Map();
function dom(id) {
  let el = _domCache.get(id);
  if (el && el.isConnected) return el;
  el = document.getElementById(id);
  if (el) _domCache.set(id, el);
  return el;
}

// Object URL for the last generated download; revoked on each new render
// so we don't leak blob memory.
let _lastDownloadUrl = null;

function readFormState() {
  const prizeInput = dom('prizeImageUpload');
  const packages = [];
  document.querySelectorAll('.package-row').forEach(r => {
    const t = r.querySelector('.package-tickets').value;
    const p = r.querySelector('.package-price').value;
    if (t && p) packages.push({ tickets: t, price: p });
  });
  const rType = dom('raffleType')?.value || '';
  // Custom promo types hide the details toggle entirely — force showDetails
  // off so any previously-entered raffle details don't leak into the render.
  const isCustom = rType === 'custom' || rType === 'custom_fr' || rType === 'custom_es';
  const showDetails = !isCustom && (dom('toggleSwitch')?.classList.contains('active') || false);
  return {
    orgName:          dom('orgName')?.value || '',
    raffleType:       rType,
    showDetails,
    logoFile:         dom('logoUpload')?.files[0] || null,
    prizeFile:        prizeInput?.files[0] || null,
    prizeInputActive: prizeInput ? !prizeInput.disabled : false,
    licenceNumber:    dom('licenceNumber')?.value || '',
    totalTickets:     dom('totalTickets')?.value || '',
    prizeAmount:      dom('prizeAmount')?.value || '',
    prizeDescription: dom('prizeDescription')?.value || '',
    prizeValue:       dom('prizeValue')?.value || '',
    drawDate:         dom('drawDate')?.value || '',
    drawTime:         dom('drawTime')?.value || '',
    drawLocation:     dom('drawLocation')?.value || '',
    qrUrl:            (dom('qrUrl')?.value || '').trim(),
    packages,
    mode:             currentMode,
    sport:            currentSport,
    ratio:            currentRatio,
    lang:             currentLang,
    brand:            window.brandPalette || null,
  };
}

// ── State capture / restore (round-trip via embedded PNG chunk) ────────────
// captureBannerState builds a serialisable snapshot of every DOM-owned form
// value plus the logo/prize image bytes. applyBannerState rehydrates it.
// The two are kept together so the shape of the snapshot lives in one place.
async function captureBannerState() {
  const packages = [];
  document.querySelectorAll('.package-row').forEach(r => {
    const t = r.querySelector('.package-tickets')?.value || '';
    const p = r.querySelector('.package-price')?.value || '';
    if (t || p) packages.push({ tickets: t, price: p });
  });

  const [logoRec, prizeRec] = await Promise.all([
    fileToRecord(document.getElementById('logoUpload')?.files?.[0]),
    fileToRecord(document.getElementById('prizeImageUpload')?.files?.[0]),
  ]);

  return {
    v: STATE_VERSION,
    savedAt: new Date().toISOString(),
    form: {
      orgName:          dom('orgName')?.value || '',
      raffleType:       dom('raffleType')?.value || '5050',
      showDetails:      dom('toggleSwitch')?.classList.contains('active') || false,
      licenceNumber:    dom('licenceNumber')?.value || '',
      totalTickets:     dom('totalTickets')?.value || '',
      prizeAmount:      dom('prizeAmount')?.value || '',
      prizeDescription: dom('prizeDescription')?.value || '',
      prizeValue:       dom('prizeValue')?.value || '',
      drawDate:         dom('drawDate')?.value || '',
      drawTime:         dom('drawTime')?.value || '',
      drawLocation:     dom('drawLocation')?.value || '',
      qrUrl:            dom('qrUrl')?.value || '',
      customMainText:   dom('customMainText')?.value || '',
      customSubText:    dom('customSubText')?.value  || '',
      packages,
      mode:             currentMode,
      sport:            currentSport,
      ratio:            currentRatio,
      lang:             currentLang,
      customW:          parseInt(dom('crpW')?.value, 10) || null,
      customH:          parseInt(dom('crpH')?.value, 10) || null,
      customTicketColor: dom('customTicketColor')?.value || null,
      customTextColor:   dom('customTextColor')?.value || null,
      brand:             window.brandPalette || null,
    },
    logo:  logoRec,
    prize: prizeRec,
  };
}

// Rehydrate the form from a captured snapshot. Order matters:
//   1. raffleType first — its onchange handler flips language + prize sections.
//   2. Text values, then packages, then mode / sport / ratio (custom size).
//   3. Restore uploaded files via DataTransfer without dispatching change,
//      then override brandPalette + palette strip with the saved values so
//      ColorThief's automatic extraction doesn't clobber the user's edits.
//   4. Detail toggle last, then generatePoster().
async function applyBannerState(state) {
  if (!state || !state.form) throw new Error('Empty or malformed state');
  const f = state.form;

  // 1. Raffle type + language. setPromoType rebuilds the raffleType dropdown
  //    so the desired value exists (it may belong to a different language than
  //    the one currently loaded), then dispatches change which triggers
  //    togglePrizeImage → applyUILanguage + prize section visibility.
  if (typeof f.raffleType === 'string') {
    setPromoType(f.raffleType);
  }

  // 2a. Text inputs
  const setVal = (id, v) => { const el = dom(id); if (el && v != null) el.value = v; };
  setVal('orgName', f.orgName);
  setVal('licenceNumber', f.licenceNumber);
  setVal('totalTickets', f.totalTickets);
  setVal('prizeAmount', f.prizeAmount);
  setVal('prizeDescription', f.prizeDescription);
  setVal('prizeValue', f.prizeValue);
  setVal('drawDate', f.drawDate);
  setVal('drawTime', f.drawTime);
  setVal('drawLocation', f.drawLocation);
  setVal('qrUrl', f.qrUrl);
  if (f.qrUrl) updateQrPreview(f.qrUrl);
  setVal('customMainText', f.customMainText);
  setVal('customSubText',  f.customSubText);
  updateCustomCounter('customMainText', 'customMainCounter', 40);
  updateCustomCounter('customSubText',  'customSubCounter',  40);

  // 2b. Packages — clear existing rows, then rebuild.
  const pc = document.getElementById('packageContainer');
  if (pc) {
    pc.innerHTML = '';
    const rows = Array.isArray(f.packages) && f.packages.length ? f.packages : [{ tickets: '', price: '' }];
    rows.forEach(p => {
      addPackage();
      const last = pc.lastElementChild;
      if (last) {
        const t = last.querySelector('.package-tickets');
        const pr = last.querySelector('.package-price');
        if (t) t.value = p.tickets ?? '';
        if (pr) pr.value = p.price ?? '';
      }
    });
    // Ensure the single default row is visible even when the saved list is empty.
    if (!pc.children.length) addPackage();
  }

  // 2c. Mode + sport
  if (f.mode) setMode(f.mode);
  if (f.sport) {
    const sBtn = document.querySelector(`.sport-btn[data-sport="${f.sport}"]`);
    if (sBtn) selectSport(sBtn);
  }

  // 2d. Ratio (custom needs W/H committed first)
  if (f.ratio === 'custom' && f.customW && f.customH) {
    const wIn = dom('crpW'), hIn = dom('crpH');
    if (wIn) wIn.value = f.customW;
    if (hIn) hIn.value = f.customH;
    const cBtn = document.getElementById('ratioCustomBtn');
    if (cBtn) selectCustomRatio(cBtn);
    commitCustomRatio();
  } else if (f.ratio) {
    const rBtn = document.querySelector(`.ratio-btn[data-ratio="${f.ratio}"]`);
    if (rBtn) selectRatio(rBtn);
  }

  // 3. Restore custom color pickers (they seed brandPalette via updateCustomColors)
  if (f.customTicketColor) {
    const el = dom('customTicketColor'); if (el) el.value = f.customTicketColor;
  }
  if (f.customTextColor) {
    const el = dom('customTextColor'); if (el) el.value = f.customTextColor;
  }
  if (f.customTicketColor || f.customTextColor) updateCustomColors();

  // 3a. Restore files. Skip the change event so updateFileLabel doesn't
  //     re-extract a palette that overwrites the one we're about to apply.
  await _restoreFileInput('logoUpload', 'logoLabel', 'logoRemoveBtn', state.logo);
  await _restoreFileInput('prizeImageUpload', 'prizeLabel', 'prizeRemoveBtn', state.prize);

  // 3b. Brand palette + palette-strip visibility. When a logo is present we
  //     show the palette strip and hide the Banner Colors pickers, mirroring
  //     what updateFileLabel does when the user uploads a logo interactively.
  if (f.brand && typeof f.brand === 'object') {
    window.brandPalette = { ...f.brand };
    _updatePaletteUI(window.brandPalette);
  }
  const hasLogo = !!state.logo;
  const strip = document.getElementById('brandPaletteStrip');
  const customCol = document.getElementById('customColorSection');
  if (strip)     strip.style.display     = hasLogo ? 'block' : 'none';
  if (customCol) customCol.style.display = hasLogo ? 'none'  : '';

  // 4. Details toggle — click it once if the saved state disagrees with the
  //    current DOM. toggleAdditional handles the rest (prize sections etc.).
  const ts = dom('toggleSwitch');
  if (ts && !!f.showDetails !== ts.classList.contains('active')) {
    toggleAdditional();
  }

  // Trigger a full re-render now that everything is in place.
  clearTimeout(_autoPreviewTimer);
  generatePoster();
}

// Shove a File back into a file input via DataTransfer, then update its
// visual label + remove button so the UI matches what the user would see
// after a manual upload. We intentionally do NOT dispatch a 'change' event
// — the caller controls when to re-render / re-derive palette.
async function _restoreFileInput(inputId, labelId, removeBtnId, rec) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (!rec) return;
  const file = recordToFile(rec);
  if (!file) return;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch (e) {
    // Safari <14 / older Firefox may not allow DataTransfer assignment to
    // a file input. Nothing we can do — the user will need to re-attach.
    console.warn(`Restore of ${inputId} skipped — browser blocks file-input write:`, e);
    return;
  }
  const label = document.getElementById(labelId);
  if (label) {
    const span = label.querySelector('span:last-child');
    if (span) span.textContent = file.name;
    label.style.borderColor = 'var(--success)';
    label.style.color = 'var(--success)';
    label.style.background = '#f0fdf4';
  }
  const rmBtn = document.getElementById(removeBtnId);
  if (rmBtn) rmBtn.style.display = 'inline-block';
}

// Handler for the restore file input on the left panel. Reads the PNG,
// extracts our embedded state chunk, and hands off to applyBannerState.
async function restoreFromPng(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const S = UI_STRINGS[currentLang];
  const restoreMsgs = _restoreMessages();
  setStatus('', restoreMsgs.loading);
  try {
    const state = await extractStateFromPng(file);
    if (!state) {
      _showRestoreError(restoreMsgs.noData);
      setStatus('', S.statusReady);
      return;
    }
    await applyBannerState(state);
    if (window.PB?.Toast) {
      window.PB.Toast.show({ title: restoreMsgs.okTitle, message: restoreMsgs.okBody, kind: 'success', duration: 4000 });
    } else {
      showToast(restoreMsgs.okBody, 4000);
    }
  } catch (err) {
    console.error('Restore failed:', err);
    _showRestoreError(restoreMsgs.badFile);
    setStatus('', S.statusReady);
  } finally {
    // Clear the input so re-selecting the same file still fires change.
    input.value = '';
  }
}

function _restoreMessages() {
  if (currentLang === 'fr') return {
    loading: 'Lecture de la bannière…',
    noData:  'Ce PNG ne contient pas de données modifiables. Il a peut-être été ré-exporté par un autre outil.',
    badFile: 'Impossible de lire ce PNG. Veuillez sélectionner une bannière téléchargée depuis cet outil.',
    okTitle: 'Bannière restaurée',
    okBody:  'Tous les champs, le logo et l\'image du prix ont été restaurés. Modifiez vos informations et régénérez.',
  };
  if (currentLang === 'es') return {
    loading: 'Leyendo la bandera…',
    noData:  'Este PNG no contiene datos editables. Es posible que otro programa lo haya vuelto a exportar.',
    badFile: 'No se pudo leer este PNG. Seleccione una bandera descargada desde esta herramienta.',
    okTitle: 'Bandera restaurada',
    okBody:  'Se restauraron todos los campos, el logo y la imagen del premio. Edite sus datos y vuelva a generar.',
  };
  return {
    loading: 'Reading banner…',
    noData:  'This PNG does not contain editable data. It may have been re-exported by another tool.',
    badFile: 'Could not read this PNG. Please select a banner downloaded from this tool.',
    okTitle: 'Banner restored',
    okBody:  'All fields, logo and prize image have been restored. Edit your details and re-generate.',
  };
}

function _showRestoreError(msg) {
  if (window.PB?.Toast) {
    window.PB.Toast.show({ title: 'Restore failed', message: msg, kind: 'danger', duration: 5000 });
  } else {
    alert(msg);
  }
}

// Cache ColorThief.getPalette results per (Image, N). Keyed by Image via
// WeakMap so entries are collected when the Image is; each inner Map holds
// the palette arrays for the palette sizes requested against that Image.
// Cross-render hits are limited by the fact that generatePoster creates a
// new Image() every run, but this still eliminates redundant work when
// multiple helpers query the same Image in a single render.
const _paletteCache = new WeakMap();
function getPaletteCached(img, n) {
  let byN = _paletteCache.get(img);
  if (!byN) { byN = new Map(); _paletteCache.set(img, byN); }
  const cached = byN.get(n);
  if (cached) return cached;
  const p = new ColorThief().getPalette(img, n);
  byN.set(n, p);
  return p;
}

// ── Palette derivation for renderers ────────────────────────────────────────
// Two distinct strategies:
//   deriveStandardColors — picks primary/secondary/accent to build the standard
//     poster's diagonal gradient background. Prefers saturated, mid-brightness
//     colours; falls back to a gray-scale-aware selection when the logo is
//     nearly monochrome.
//   deriveSportColors — picks accent + darkest + lightest for sport-specific
//     text stroke and shape stroke work. Uses the dominant colour helper.
// Both honour window.brandPalette when the user has confirmed one.

function deriveStandardColors(img) {
  const FALLBACK_PALETTE = [[40,60,120],[80,100,160],[60,80,140],[100,120,180],[120,140,200],[50,70,130],[90,110,170],[70,90,150]];
  let palette;
  try { palette = getPaletteCached(img, 8); }
  catch (_e) { palette = null; }
  // Guard against ColorThief returning null or fewer than 2 entries — the
  // 1x1 transparent stand-in used in logoless mode leaves it empty, and
  // downstream code indexes palette[0] and palette[1] unconditionally.
  if (!palette || palette.length < 2) palette = FALLBACK_PALETTE;

  const getSat = (r,g,b) => { const mx=Math.max(r,g,b), mn=Math.min(r,g,b); return mx===0 ? 0 : (mx-mn)/mx; };
  const getBri = (r,g,b) => Math.max(r,g,b)/255;

  let totalSat = 0;
  for (const c of palette) totalSat += getSat(...c);
  const isGray = (totalSat / palette.length) < 0.15;

  let best = palette[0], bestS = -1;
  for (const c of palette) {
    const [r,g,b] = c;
    const sat = getSat(r,g,b), bri = getBri(r,g,b);
    if (bri > 0.85) continue;
    const score = isGray ? 1 - bri : sat * (1 - bri * 0.5);
    if (score > bestS) { bestS = score; best = c; }
  }

  let primaryColor, secondaryColor, accentColor;
  if (window.brandPalette) {
    primaryColor   = `rgb(${hexToRgbArr(window.brandPalette.primary).join(',')})`;
    secondaryColor = `rgb(${hexToRgbArr(window.brandPalette.mid).join(',')})`;
    accentColor    = `rgb(${hexToRgbArr(window.brandPalette.accent).join(',')})`;
  } else {
    primaryColor   = `rgb(${best.join(',')})`;
    secondaryColor = `rgb(${palette[1].join(',')})`;
    accentColor    = `rgb(${palette[2].join(',')})`;
  }

  const colorDiff = Math.sqrt(
    Math.pow(palette[0][0]-palette[1][0], 2) +
    Math.pow(palette[0][1]-palette[1][1], 2) +
    Math.pow(palette[0][2]-palette[1][2], 2)
  );
  const isSingleColored = colorDiff < 50;

  return { primaryColor, secondaryColor, accentColor, isSingleColored };
}

function deriveSportColors(img) {
  if (window.brandPalette) {
    const accentColor   = hexToRgbArr(window.brandPalette.accent);
    const darkestColor  = hexToRgbArr(window.brandPalette.dark);
    const lightestColor = hexToRgbArr(window.brandPalette.light);
    const lightestLum   = (0.299*lightestColor[0] + 0.587*lightestColor[1] + 0.114*lightestColor[2]) / 255;
    return { accentColor, lightestColor, darkestColor, lightestLum };
  }

  const accentColor = getDominantColor(img);
  let logoPalette = [[80,80,80]];
  try { logoPalette = getPaletteCached(img, 8); } catch (_e) {}

  let lightestLum = -1, darkestLum = 2;
  let lightestColor = [255,255,255], darkestColor = [0,0,0];
  for (const [r,g,b] of logoPalette) {
    const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    if (lum > lightestLum) { lightestLum = lum; lightestColor = [r,g,b]; }
    if (lum < darkestLum)  { darkestLum  = lum; darkestColor  = [r,g,b]; }
  }
  return { accentColor, lightestColor, darkestColor, lightestLum };
}

function updateQrPreview(url) {
  const wrap = document.getElementById('qrPreviewWrap');
  const box  = document.getElementById('qrPreviewBox');
  const removeBtn = document.getElementById('qrRemoveBtn');
  if (!url || url.trim() === '') {
    wrap.style.display = 'none';
    box.style.display  = 'none';
    if (removeBtn) removeBtn.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';
  box.style.display  = 'block';
  if (removeBtn) removeBtn.style.display = 'inline-block';
  box.innerHTML = '';
  try {
    _qrInstance = new QRCode(box, {
      text: url.trim(),
      width: 52, height: 52,
      colorDark: '#000000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch(e) { console.warn('QR preview error:', e); }
}

// Draw QR code onto the canvas (called inside finaliseDownload)
// drawQROnCanvas(ctx, x, y, size, url)
// Draws a QR code at (x,y) with the given pixel size, including a white
// background pill and "Scan to buy tickets" label below.
function drawQROnCanvas(ctx, x, y, size, url) {
  if (!url || !url.trim()) return Promise.resolve();

  const pad = Math.round(size * 0.15);
  const labelFS = Math.max(8, Math.round(size * 0.13));
  const labelText = getRaffleStrings(document.getElementById('raffleType')?.value || '5050').scanQR;

  // Measure label to ensure pill is wide enough
  ctx.save();
  ctx.font = `600 ${labelFS}px 'Plus Jakarta Sans',sans-serif`;
  const labelW = ctx.measureText(labelText).width + 12;
  const qrPillW = size + pad * 2;
  const pillW = Math.max(qrPillW, labelW);
  const pillH = size + pad * 2 + labelFS + 8;
  const pillX = x - pad - (pillW - qrPillW) / 2;
  const pillCx = pillX + pillW / 2;

  // White background pill
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(ctx, pillX, y - pad, pillW, pillH, 6);
  ctx.fill();
  // Label
  ctx.font = `600 ${labelFS}px 'Plus Jakarta Sans',sans-serif`;
  ctx.fillStyle = '#374151';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(labelText, pillCx, y + size + pad + labelFS);
  ctx.restore();

  // Poll one animation frame at a time until QRCode.js emits a <canvas> or
  // a fully-loaded <img>. Rejects after 3s so slow-render failures surface
  // instead of silently shipping a QR-less download.
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(host);
    const cleanup = () => { try { host.remove(); } catch (_) {} };

    try {
      new QRCode(host, {
        text: url.trim(),
        width: size * 2, height: size * 2,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (err) {
      cleanup();
      return reject(err);
    }

    const startedAt = performance.now();
    const TIMEOUT_MS = 3000;
    const tick = () => {
      const el = host.querySelector('canvas, img');
      const ready = el && (el.tagName === 'CANVAS' || (el.complete && el.naturalWidth > 0));
      if (ready) {
        try {
          ctx.drawImage(el, x, y, size, size);
          cleanup();
          resolve();
        } catch (err) {
          cleanup();
          reject(err);
        }
        return;
      }
      if (performance.now() - startedAt > TIMEOUT_MS) {
        cleanup();
        reject(new Error('QR render timeout'));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ── COPY TO CLIPBOARD ──────────────────────────────────────────────────────
async function copyToClipboard() {
  const canvas = document.getElementById('preview');
  const btn = document.getElementById('copyBtn');
  const S = UI_STRINGS[currentLang];
  if (!canvas.classList.contains('visible')) return;
  try {
    canvas.toBlob(async (blob) => {
      if (!blob) { showToast(S.toastCopyFail1); return; }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        btn.classList.add('copied');
        btn.textContent = S.copiedBtn;
        showToast(S.toastCopied);
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.textContent = S.copyBtn;
        }, 2500);
      } catch(e) {
        showToast(S.toastCopyFail2);
      }
    }, 'image/png');
  } catch(e) {
    showToast(S.toastCopyFail3);
  }
}

// ── TOAST NOTIFICATION ────────────────────────────────────────────────────
function showToast(msg, duration=2800) {
  // Prefer the accessible PB toast when the UI kit is loaded; fall back to
  // the legacy #toast element so this function keeps working standalone.
  if (window.PB?.Toast) {
    window.PB.Toast.show({ message: msg, kind: 'info', duration });
    return;
  }
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// Size guide removed



// ─── Canvas helpers ────────────────────────────────────────────────────────────
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line='', yPos=y;
  for (let n=0; n<words.length; n++) {
    const testLine = line+words[n]+' ';
    if (ctx.measureText(testLine).width > maxWidth && n>0) {
      ctx.fillText(line,x,yPos); line=words[n]+' '; yPos+=lineHeight;
    } else line=testLine;
  }
  ctx.fillText(line,x,yPos);
  return yPos + lineHeight;  // return Y *after* the last line so callers advance correctly
}

// ── fitText: smart text scaling with shrink + wrap ─────────────────────────
// Returns { fontSize, lines[], lineHeight } that fits `text` within maxWidth.
// Progressively shrinks from startFS down to minFS; wraps to 2 lines if needed.
// fontBuilder(fs) → returns the CSS font string for a given size.
function fitText(ctx, text, maxWidth, startFS, minFS, fontBuilder) {
  minFS = minFS || 10;
  if (!fontBuilder) fontBuilder = fs => `bold ${fs}px "Helvetica Neue",Helvetica,Arial,sans-serif`;

  let fs = startFS;
  let lines, lineH;

  // Phase 1: try single line, shrinking font
  for (; fs >= minFS; fs--) {
    ctx.font = fontBuilder(fs);
    lineH = Math.round(fs * 1.18);
    if (ctx.measureText(text).width <= maxWidth) {
      return { fontSize: fs, lines: [text], lineHeight: lineH };
    }
  }

  // Phase 2: at min font, wrap to 2 lines at best split point
  fs = Math.max(minFS, Math.round(startFS * 0.85));
  for (; fs >= minFS; fs--) {
    ctx.font = fontBuilder(fs);
    lineH = Math.round(fs * 1.18);
    const words = text.split(' ');
    if (words.length < 2) break;
    // Find the split that minimises the wider line
    let bestLines = [text], bestMax = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      const mw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width);
      if (mw < bestMax) { bestMax = mw; bestLines = [l1, l2]; }
    }
    if (bestMax <= maxWidth) {
      return { fontSize: fs, lines: bestLines, lineHeight: lineH };
    }
  }

  // Phase 3: try 3 lines as last resort
  fs = minFS;
  ctx.font = fontBuilder(fs);
  lineH = Math.round(fs * 1.18);
  const words3 = text.split(' ');
  if (words3.length >= 3) {
    let best3 = [text], best3Max = Infinity;
    for (let i = 1; i < words3.length - 1; i++) {
      for (let j = i + 1; j < words3.length; j++) {
        const l1 = words3.slice(0, i).join(' ');
        const l2 = words3.slice(i, j).join(' ');
        const l3 = words3.slice(j).join(' ');
        const mw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width, ctx.measureText(l3).width);
        if (mw < best3Max) { best3Max = mw; best3 = [l1, l2, l3]; }
      }
    }
    if (best3Max <= maxWidth) {
      return { fontSize: fs, lines: best3, lineHeight: lineH };
    }
  }

  // Final fallback: min size, wrapped by wrapText logic (may still overflow)
  ctx.font = fontBuilder(minFS);
  return { fontSize: minFS, lines: [text], lineHeight: Math.round(minFS * 1.18) };
}

// Helper: draw lines returned by fitText, centred at (cx, startY)
function drawFitLines(ctx, lines, cx, startY, lineHeight) {
  lines.forEach((ln, i) => {
    ctx.fillText(ln, cx, startY + i * lineHeight);
  });
}
function strokeFitLines(ctx, lines, cx, startY, lineHeight) {
  lines.forEach((ln, i) => {
    ctx.strokeText(ln, cx, startY + i * lineHeight);
  });
}

function hasWhiteBackground(img) {
  const o=document.createElement('canvas'); o.width=img.width; o.height=img.height;
  // willReadFrequently hints the browser to keep this canvas backing store
  // on the CPU side — getImageData calls skip the GPU→CPU roundtrip.
  const c=o.getContext('2d',{willReadFrequently:true}); c.drawImage(img,0,0);
  const pts=[[2,2],[img.width-3,2],[2,img.height-3],[img.width-3,img.height-3],[Math.floor(img.width/2),2]];
  let wc=0;
  for (const [sx,sy] of pts) { try { const p=c.getImageData(sx,sy,1,1).data; if(p[0]>230&&p[1]>230&&p[2]>230) wc++; } catch(e){} }
  return wc>=3;
}

// Rounded rect helper
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

// Scalloped rectangle: rounded corners on outside, scalloped on inner edge.
// 50 scallops. Both tickets share the same scallop geometry so bumps/indents
// sit at identical Y positions — outcrop on left lines up with indent on right.
// side: 'left'   → scalloped on right edge (bumps protrude rightward)
// side: 'right'  → scalloped on left  edge (bumps indent leftward / same positions)
// side: 'top'    → scalloped on bottom edge (for stacked portrait)
// side: 'bottom' → scalloped on top edge (for stacked portrait)

// ── TEAR LINE: dashed perforation line drawn in the gap between two tickets ──
function drawTearLine(ctx, lx, ly, tw, th, gap, isPortrait) {
  const dashLen = 6, gapLen = 5;
  ctx.save();
  ctx.strokeStyle = 'rgba(180,160,130,0.55)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([dashLen, gapLen]);
  ctx.lineCap = 'round';
  if (isPortrait) {
    // Horizontal tear line at mid-gap Y
    const tearY = ly + th + gap / 2;
    ctx.beginPath();
    ctx.moveTo(lx + 8, tearY);
    ctx.lineTo(lx + tw - 8, tearY);
    ctx.stroke();
    // Tiny scissors icon
    const sx = lx + tw - 4, sy = tearY;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(150,130,100,0.60)';
    ctx.lineWidth = 1;
    // Left blade
    ctx.beginPath(); ctx.moveTo(sx-7,sy-5); ctx.quadraticCurveTo(sx,sy,sx-7,sy+5); ctx.stroke();
    // Right blade
    ctx.beginPath(); ctx.moveTo(sx+7,sy-5); ctx.quadraticCurveTo(sx,sy,sx+7,sy+5); ctx.stroke();
    // Pivot
    ctx.beginPath(); ctx.arc(sx,sy,1.5,0,Math.PI*2); ctx.fillStyle='rgba(150,130,100,0.60)'; ctx.fill();
  } else {
    // Vertical tear line at mid-gap X
    const tearX = lx + tw + gap / 2;
    ctx.beginPath();
    ctx.moveTo(tearX, ly + 8);
    ctx.lineTo(tearX, ly + th - 8);
    ctx.stroke();
    // Tiny scissors icon (rotated 90°)
    const sx = tearX, sy = ly + th - 4;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(150,130,100,0.60)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx-5,sy-7); ctx.quadraticCurveTo(sx,sy,sx+5,sy-7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx-5,sy+7); ctx.quadraticCurveTo(sx,sy,sx+5,sy+7); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx,sy,1.5,0,Math.PI*2); ctx.fillStyle='rgba(150,130,100,0.60)'; ctx.fill();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ── TICKET SERIAL NUMBER — authentic ticket stub feel ─────────────────────────
function drawTicketSerial(ctx, x, y, w, h, side, num) {
  ctx.save();
  const fs = Math.max(9, Math.round(Math.min(w, h) * 0.028));
  const text = `#${String(num).padStart(6,'0')}`;
  ctx.font = `600 ${fs}px 'Courier New',monospace`;
  ctx.fillStyle = 'rgba(100,80,50,0.38)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Position: near the scallop edge, centred vertically
  const isLandscape = (side === 'left' || side === 'right');
  if (isLandscape) {
    // Rotate 90° near the scallop (tear) edge
    const edgeX = side === 'left' ? x + w - fs*1.8 : x + fs*1.8;
    const edgeMidY = y + h / 2;
    ctx.translate(edgeX, edgeMidY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(text, 0, 0);
  } else {
    // Portrait top/bottom: rotate near scallop bottom/top
    const edgeY = side === 'top' ? y + h - fs*1.8 : y + fs*1.8;
    const edgeMidX = x + w / 2;
    ctx.translate(edgeMidX, edgeY);
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

function scalloppedRect(ctx, x, y, w, h, cornerR, side) {
  const scallops = 50;

  if (side === 'top' || side === 'bottom') {
    // Horizontal scallops. sR = radius of each scallop semicircle.
    // We use scallops count so that the tear edge of both tickets
    // have matching bumps/indents at the same X positions.
    const sR = w / (scallops * 2);
    ctx.beginPath();

    if (side === 'top') {
      // ── TOP ticket: rounded top-left & top-right corners; scalloped BOTTOM edge ──
      // Path direction: clockwise.
      // Start at top-left corner arc end-point.
      ctx.moveTo(x + cornerR, y);
      // Top edge →
      ctx.lineTo(x + w - cornerR, y);
      // Top-right rounded corner
      ctx.arcTo(x + w, y, x + w, y + cornerR, cornerR);
      // Right edge ↓ all the way to bottom-right
      ctx.lineTo(x + w, y + h);
      // Scalloped bottom edge: travel RIGHT → LEFT (so i goes high → low)
      // Each arc is centred at (x + sR + i*sR*2, y+h).
      // Even i → outward protrusion (downward bump), odd i → inward indent.
      // Travelling R→L means we arc from angle 0→π anticlockwise for outward,
      // and 0→π clockwise for inward.
      for (let i = scallops - 1; i >= 0; i--) {
        const cx2 = x + sR + i * sR * 2;
        const outward = (i % 2 === 0);
        // Anticlockwise (true) = outward bump downward when travelling R→L
        ctx.arc(cx2, y + h, sR, 0, Math.PI, !outward);
      }
      // Now at bottom-left (x, y+h). Left edge ↑
      ctx.lineTo(x, y + cornerR);
      // Top-left rounded corner
      ctx.arcTo(x, y, x + cornerR, y, cornerR);

    } else {
      // ── BOTTOM ticket: scalloped TOP edge; rounded bottom-left & bottom-right corners ──
      // Path direction: clockwise starting from top-left.
      // Scalloped top edge: travel LEFT → RIGHT (i = 0 → scallops-1)
      // Even i → inward indent (upward), odd i → outward protrusion downward.
      // Start exactly at x (left edge, y level) — first arc will start there.
      ctx.moveTo(x, y);
      for (let i = 0; i < scallops; i++) {
        const cx2 = x + sR + i * sR * 2;
        const inward = (i % 2 === 0);
        // Clockwise (false) = inward indent upward when travelling L→R
        ctx.arc(cx2, y, sR, Math.PI, 0, inward);
      }
      // Now at (x+w, y). Right edge ↓
      ctx.lineTo(x + w, y + h - cornerR);
      // Bottom-right rounded corner
      ctx.arcTo(x + w, y + h, x + w - cornerR, y + h, cornerR);
      // Bottom edge ←
      ctx.lineTo(x + cornerR, y + h);
      // Bottom-left rounded corner
      ctx.arcTo(x, y + h, x, y + h - cornerR, cornerR);
      // Left edge ↑ back to start
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    return;
  }

  const sR = h / (scallops * 2);   // radius of each semicircle

  ctx.beginPath();

  if (side === 'left') {
    // Start top-left, go clockwise
    ctx.moveTo(x + cornerR, y);
    // Top edge → top-right corner (right edge is the tear side — no round corner)
    ctx.lineTo(x + w, y);
    // RIGHT edge: alternating outward (protrude right) / inward (indent left) arcs
    // i=0 → outward (anticlockwise arc centred ON the edge, bulging right)
    for (let i = 0; i < scallops; i++) {
      const cy = y + sR + i * sR * 2;
      // i even → protrude right: clockwise (anticlockwise=false) sweeps through right side of circle
      // i odd  → indent left:   ccw (anticlockwise=true) sweeps through left side
      const outward = (i % 2 === 0);
      ctx.arc(x + w, cy, sR, -Math.PI / 2, Math.PI / 2, !outward);
    }
    // Bottom-right to bottom-left
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + cornerR, y + h);
    ctx.arcTo(x, y + h, x, y + h - cornerR, cornerR);
    ctx.lineTo(x, y + cornerR);
    ctx.arcTo(x, y, x + cornerR, y, cornerR);

  } else {
    // RIGHT ticket: scalloped on LEFT edge.
    // Same Y centres, but bumps indent into the ticket (concave from left).
    // We trace the left edge top→bottom so the same i=0 position gets an inward arc.
    ctx.moveTo(x, y);
    for (let i = 0; i < scallops; i++) {
      const cy = y + sR + i * sR * 2;
      // Match left ticket: i even → left ticket protrudes right, so right ticket indents left
      // indent left = centre on x, arc from top to bottom going anticlockwise (clockwise=false means ccw)
      // i even: left ticket protrudes right → right ticket must indent left → anticlockwise=true
      // i odd:  left ticket indents left   → right ticket protrudes right → anticlockwise=false
      const inward = (i % 2 === 0);
      ctx.arc(x, cy, sR, -Math.PI / 2, Math.PI / 2, inward);
    }
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w - cornerR, y + h);
    ctx.arcTo(x + w, y + h, x + w, y + h - cornerR, cornerR);
    ctx.lineTo(x + w, y + cornerR);
    ctx.arcTo(x + w, y, x + w - cornerR, y, cornerR);
    ctx.lineTo(x, y);
  }

  ctx.closePath();
}


// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND DRAWERS — brightened by ~50% vs v3
// ═══════════════════════════════════════════════════════════════════════════════

function drawHockeyBg(ctx, W, H) {
  // Bright ice
  gfx.linearFill(ctx, W, H, [[0, '#e8f4fd'], [1, '#f6fbff']]);
  ctx.fillStyle='#f8f8f8'; ctx.fillRect(0,0,W,22);
  ctx.fillStyle='#dff0fa'; ctx.fillRect(0,22,W,8);
  ctx.fillStyle='#ff4040'; ctx.fillRect(0,30,W,6);
  ctx.fillStyle='#2196f3'; ctx.fillRect(0,36,W,3);
  ctx.save(); ctx.globalAlpha=0.035; ctx.strokeStyle='#99bbdd'; ctx.lineWidth=1;
  for(let i=0;i<H;i+=14){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(W,i+5);ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle='#ff4040'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
  ctx.strokeStyle='#2196f3'; ctx.lineWidth=6;
  ctx.beginPath(); ctx.moveTo(W*0.27,0); ctx.lineTo(W*0.27,H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.73,0); ctx.lineTo(W*0.73,H); ctx.stroke();
  ctx.strokeStyle='#2196f3'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(W/2,H/2,90,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='#ff4040'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(W/2,H/2,8,0,Math.PI*2); ctx.stroke();
  function drawCrease(gx,gy){
    ctx.strokeStyle='#ff4040'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(gx,gy,55,Math.PI*0.65,Math.PI*1.35,false); ctx.stroke();
    ctx.strokeStyle='#ff4040'; ctx.lineWidth=2; ctx.strokeRect(gx-26,gy-18,52,20);
  }
  drawCrease(W*0.06,H/2); drawCrease(W*0.94,H/2);
  ctx.fillStyle='#ff4040';
  [[W*0.27,H*0.25],[W*0.27,H*0.75],[W*0.73,H*0.25],[W*0.73,H*0.75]].forEach(([fx,fy])=>{
    ctx.beginPath(); ctx.arc(fx,fy,7,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#ff4040'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(fx,fy,40,0,Math.PI*2); ctx.stroke();
  });
  ctx.fillStyle='#2196f3'; ctx.fillRect(0,H-3,W,3);
  ctx.fillStyle='#ff4040'; ctx.fillRect(0,H-9,W,6);
  ctx.fillStyle='#dff0fa'; ctx.fillRect(0,H-17,W,8);
  ctx.fillStyle='#f8f8f8'; ctx.fillRect(0,H-22,W,5);
}

// Hockey and Ringette share same ice background
function drawRingetteBg(ctx, W, H) { drawHockeyBg(ctx, W, H); }

function drawSoccerBg(ctx, W, H) {
  gfx.vStripes(ctx, W, H, 12, ['#4caf50', '#66bb6a']);
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.05,H*0.08,W*0.9,H*0.84);
  ctx.beginPath(); ctx.moveTo(W/2,H*0.08); ctx.lineTo(W/2,H*0.92); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2,H/2,80,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(W/2,H/2,5,0,Math.PI*2); ctx.fill();
  ctx.strokeRect(W*0.05,H*0.3,W*0.18,H*0.4);
  ctx.strokeRect(W*0.77,H*0.3,W*0.18,H*0.4);
  ctx.strokeRect(W*0.05,H*0.39,W*0.08,H*0.22);
  ctx.strokeRect(W*0.87,H*0.39,W*0.08,H*0.22);
  ctx.fillStyle='rgba(255,255,255,0.3)';
  ctx.fillRect(W*0.02,H*0.41,W*0.04,H*0.18);
  ctx.fillRect(W*0.94,H*0.41,W*0.04,H*0.18);
  [[W*0.05,H*0.08],[W*0.95,H*0.08],[W*0.05,H*0.92],[W*0.95,H*0.92]].forEach(([cx,cy])=>{
    ctx.beginPath(); ctx.arc(cx,cy,18,0,Math.PI*2); ctx.stroke();
  });
}

function drawFootballBg(ctx, W, H) {
  gfx.vStripes(ctx, W, H, 10, ['#43a047', '#4caf50']);
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=2.5;
  ctx.strokeRect(W*0.04,H*0.06,W*0.92,H*0.88);
  for(let x=0.14;x<0.96;x+=0.09){
    ctx.beginPath(); ctx.moveTo(W*x,H*0.06); ctx.lineTo(W*x,H*0.94); ctx.stroke();
  }
  ctx.lineWidth=4; ctx.strokeStyle='rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.moveTo(W/2,H*0.06); ctx.lineTo(W/2,H*0.94); ctx.stroke();
  ctx.lineWidth=2; ctx.strokeStyle='rgba(255,255,255,0.65)';
  for(let x=0.04;x<0.96;x+=0.045){
    const px=W*x;
    ctx.beginPath(); ctx.moveTo(px,H*0.38); ctx.lineTo(px,H*0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px,H*0.58); ctx.lineTo(px,H*0.62); ctx.stroke();
  }
  ctx.fillStyle='rgba(21,101,192,0.3)'; ctx.fillRect(W*0.04,H*0.06,W*0.09,H*0.88);
  ctx.fillStyle='rgba(192,21,21,0.3)'; ctx.fillRect(W*0.87,H*0.06,W*0.09,H*0.88);
}

function drawBaseballBg(ctx, W, H) {
  // Outfield green
  ctx.fillStyle='#4a9a4a'; ctx.fillRect(0,0,W,H);
  // Dirt infield arc
  ctx.fillStyle='#a0724a';
  ctx.beginPath(); ctx.arc(W/2,H+100,H*1.35,Math.PI,2*Math.PI); ctx.fill();
  ctx.fillStyle='#d4a06a';
  ctx.beginPath(); ctx.arc(W/2,H*0.85,H*0.68,Math.PI,2*Math.PI); ctx.fill();
  ctx.fillStyle='#5aaa5a';
  ctx.beginPath(); ctx.arc(W/2,H*0.85,H*0.52,Math.PI,2*Math.PI); ctx.fill();
  // Mowed outfield stripes
  ctx.save(); ctx.globalAlpha=0.12; ctx.strokeStyle='#006600'; ctx.lineWidth=16;
  for(let i=0;i<8;i++){ctx.beginPath(); ctx.arc(W/2,H*0.85,(i+2)*48,Math.PI,2*Math.PI); ctx.stroke();}
  ctx.restore();

  // Diamond: home(bottom) → 1st(right) → 2nd(top) → 3rd(left) → home
  const bx=W/2, by=H*0.84, bd=H*0.30;
  const home=[bx, by];
  const first=[bx+bd, by-bd];
  const second=[bx, by-bd*2];
  const third=[bx-bd, by-bd];

  // Baselines — thick bright white
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=Math.max(3, W*0.006); ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(...home); ctx.lineTo(...first);
  ctx.lineTo(...second); ctx.lineTo(...third);
  ctx.lineTo(...home);
  ctx.stroke();

  // Foul lines extending from home to corners
  ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=Math.max(2, W*0.004);
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(W*0.04,H*0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(W*0.96,H*0.04); ctx.stroke();

  // Base squares (white filled)
  const bsz = Math.max(8, W*0.022);
  function drawBase(px, py) {
    ctx.save(); ctx.translate(px,py); ctx.rotate(Math.PI/4);
    ctx.fillStyle='white'; ctx.strokeStyle='rgba(200,190,170,0.7)'; ctx.lineWidth=1;
    ctx.fillRect(-bsz/2,-bsz/2,bsz,bsz); ctx.strokeRect(-bsz/2,-bsz/2,bsz,bsz);
    ctx.restore();
  }
  drawBase(first[0],first[1]); drawBase(second[0],second[1]); drawBase(third[0],third[1]);
  // Home plate — pentagon
  ctx.fillStyle='white'; ctx.strokeStyle='rgba(200,190,170,0.7)'; ctx.lineWidth=1;
  const hp=bsz*0.9;
  ctx.beginPath();
  ctx.moveTo(bx,by-hp*1.1); ctx.lineTo(bx+hp,by-hp*0.4); ctx.lineTo(bx+hp,by+hp*0.5);
  ctx.lineTo(bx-hp,by+hp*0.5); ctx.lineTo(bx-hp,by-hp*0.4); ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Pitcher's mound
  ctx.fillStyle='#d4a06a';
  ctx.beginPath(); ctx.arc(bx, by-bd, Math.max(6,W*0.014), 0, Math.PI*2); ctx.fill();
}

function drawSoftballBg(ctx, W, H) {
  // Brighter green for softball
  ctx.fillStyle='#5aaa5a'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#b07040';
  ctx.beginPath(); ctx.arc(W/2,H+100,H*1.35,Math.PI,2*Math.PI); ctx.fill();
  ctx.fillStyle='#d4a46a';
  ctx.beginPath(); ctx.arc(W/2,H*0.85,H*0.65,Math.PI,2*Math.PI); ctx.fill();
  ctx.fillStyle='#66aa66';
  ctx.beginPath(); ctx.arc(W/2,H*0.85,H*0.50,Math.PI,2*Math.PI); ctx.fill();
  ctx.save(); ctx.globalAlpha=0.10; ctx.strokeStyle='#008800'; ctx.lineWidth=16;
  for(let i=0;i<8;i++){ctx.beginPath(); ctx.arc(W/2,H*0.85,(i+2)*44,Math.PI,2*Math.PI); ctx.stroke();}
  ctx.restore();

  const bx=W/2, by=H*0.84, bd=H*0.28;
  const home=[bx,by], first=[bx+bd,by-bd], second=[bx,by-bd*2], third=[bx-bd,by-bd];

  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=Math.max(3,W*0.006); ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(...home); ctx.lineTo(...first); ctx.lineTo(...second); ctx.lineTo(...third); ctx.lineTo(...home);
  ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=Math.max(2,W*0.004);
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(W*0.04,H*0.04); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(W*0.96,H*0.04); ctx.stroke();

  const bsz=Math.max(8,W*0.022);
  function drawBase(px,py){ctx.save();ctx.translate(px,py);ctx.rotate(Math.PI/4);ctx.fillStyle='white';ctx.strokeStyle='rgba(200,190,170,0.7)';ctx.lineWidth=1;ctx.fillRect(-bsz/2,-bsz/2,bsz,bsz);ctx.strokeRect(-bsz/2,-bsz/2,bsz,bsz);ctx.restore();}
  drawBase(first[0],first[1]); drawBase(second[0],second[1]); drawBase(third[0],third[1]);
  const hp=bsz*0.9;
  ctx.fillStyle='white'; ctx.strokeStyle='rgba(200,190,170,0.7)'; ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(bx,by-hp*1.1); ctx.lineTo(bx+hp,by-hp*0.4); ctx.lineTo(bx+hp,by+hp*0.5);
  ctx.lineTo(bx-hp,by+hp*0.5); ctx.lineTo(bx-hp,by-hp*0.4); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle='#d4a46a';
  ctx.beginPath(); ctx.arc(bx,by-bd,Math.max(6,W*0.014),0,Math.PI*2); ctx.fill();
}

function drawBasketballBg(ctx, W, H) {
  gfx.woodTexture(ctx, W, H, { base: 190, step: 8, rowH: 22, tint: { g: 0.82, b: 0.55 }, rOffset: 20 });
  gfx.horizontalTexture(ctx, W, H, { color: '#000', alpha: 0.06, lineWidth: 1, step: 22 });
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.04,H*0.07,W*0.92,H*0.86);
  ctx.beginPath(); ctx.moveTo(W/2,H*0.07); ctx.lineTo(W/2,H*0.93); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2,H/2,75,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(255,160,0,0.8)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(W/2,H/2,10,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(W*0.14,H/2,H*0.42,-Math.PI/2.2,Math.PI/2.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W*0.86,H/2,H*0.42,Math.PI-Math.PI/2.2,Math.PI+Math.PI/2.2); ctx.stroke();
  ctx.strokeRect(W*0.04,H*0.33,W*0.2,H*0.34);
  ctx.strokeRect(W*0.76,H*0.33,W*0.2,H*0.34);
  ctx.beginPath(); ctx.arc(W*0.24,H/2,55,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W*0.76,H/2,55,0,Math.PI*2); ctx.stroke();
  ctx.lineWidth=5; ctx.strokeStyle='rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.moveTo(W*0.04,H*0.42); ctx.lineTo(W*0.04,H*0.58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.96,H*0.42); ctx.lineTo(W*0.96,H*0.58); ctx.stroke();
}

function drawWaterPoloBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0, '#1565c0'], [1, '#1e88e5']]);
  ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=2;
  for(let y=H*0.15;y<H*0.9;y+=H*0.12){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.04,H*0.06,W*0.92,H*0.88);
  ctx.beginPath(); ctx.moveTo(W/2,H*0.06); ctx.lineTo(W/2,H*0.94); ctx.stroke();
  [[0.12,'#ef5350'],[0.2,'#ef5350'],[0.25,'#ffee58']].forEach(([t,c])=>{
    ctx.strokeStyle=c+'cc'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(W*t,H*0.06); ctx.lineTo(W*t,H*0.94); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W*(1-t),H*0.06); ctx.lineTo(W*(1-t),H*0.94); ctx.stroke();
  });
  ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.fillRect(W*0.02,H*0.38,W*0.04,H*0.24); ctx.fillRect(W*0.94,H*0.38,W*0.04,H*0.24);
  ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.02,H*0.38,W*0.04,H*0.24); ctx.strokeRect(W*0.94,H*0.38,W*0.04,H*0.24);
  gfx.waves(ctx, W, H, { color: '#90caf9', alpha: 0.08, lineWidth: 1, step: 40, amp: 5, cycles: 8, startY: 30, xStep: 4 });
}

function drawVolleyballBg(ctx, W, H) {
  gfx.woodTexture(ctx, W, H, { base: 195, step: 7, rowH: 22, tint: { g: 0.85, b: 0.52 }, rOffset: 30 });
  gfx.horizontalTexture(ctx, W, H, { color: '#000', alpha: 0.05, lineWidth: 1, step: 22 });
  ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.06,H*0.08,W*0.88,H*0.84);
  ctx.beginPath(); ctx.moveTo(W/2,H*0.08); ctx.lineTo(W/2,H*0.92); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(W/2-2,H*0.02); ctx.lineTo(W/2-2,H*0.98); ctx.stroke();
  ctx.lineWidth=1; ctx.strokeStyle='rgba(255,255,255,0.35)';
  for(let y=H*0.02;y<H*0.98;y+=12){ctx.beginPath();ctx.moveTo(W/2-8,y);ctx.lineTo(W/2+8,y);ctx.stroke();}
  ctx.strokeStyle='rgba(255,220,0,0.8)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(W*0.33,H*0.08); ctx.lineTo(W*0.33,H*0.92); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.67,H*0.08); ctx.lineTo(W*0.67,H*0.92); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(W*0.06,H/2); ctx.lineTo(W*0.33,H/2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.67,H/2); ctx.lineTo(W*0.94,H/2); ctx.stroke();
}

function drawCurlingBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0, '#e8f0f5'], [1, '#f5f9fc']]);
  gfx.horizontalTexture(ctx, W, H, { color: '#78909c', alpha: 0.04, lineWidth: 0.5, step: 10 });
  ctx.strokeStyle='#ef5350'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(0,H*0.24); ctx.lineTo(W,H*0.24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,H*0.76); ctx.lineTo(W,H*0.76); ctx.stroke();
  ctx.strokeStyle='#1e88e5'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(0,H*0.18); ctx.lineTo(W,H*0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,H*0.82); ctx.lineTo(W,H*0.82); ctx.stroke();
  ctx.strokeStyle='#ef5350'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
  // Houses — R/W/B, 20% bigger
  function drawHouse(cx,cy){
    const s=1.2;
    ctx.fillStyle='#ef5350'; ctx.beginPath(); ctx.arc(cx,cy,66*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='white';   ctx.beginPath(); ctx.arc(cx,cy,48*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1e88e5'; ctx.beginPath(); ctx.arc(cx,cy,30*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='white';   ctx.beginPath(); ctx.arc(cx,cy,12*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ef5350'; ctx.beginPath(); ctx.arc(cx,cy,5*s,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#1e88e5'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(cx-72*s,cy); ctx.lineTo(cx+72*s,cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-72*s); ctx.lineTo(cx,cy+72*s); ctx.stroke();
  }
  drawHouse(W/2,H*0.18); drawHouse(W/2,H*0.82);
  ctx.fillStyle='#90a4ae';
  ctx.fillRect(W/2-15,H*0.06-4,30,8); ctx.fillRect(W/2-15,H*0.94-4,30,8);
}

function drawGymnasticsBg(ctx, W, H) {
  // Warm gym floor base
  gfx.linearFill(ctx, W, H, [[0,'#f5e6d3'],[0.5,'#e8d5bc'],[1,'#d4c0a5']]);
  // Wood plank grain lines
  ctx.save(); ctx.globalAlpha=0.06; ctx.strokeStyle='#8b6914'; ctx.lineWidth=1;
  for(let yi=0;yi<H;yi+=18){ctx.beginPath();ctx.moveTo(0,yi+Math.sin(yi*0.1)*3);ctx.lineTo(W,yi+Math.sin(yi*0.1+2)*3);ctx.stroke();}
  ctx.restore();
  // Spring floor mat (blue rectangle in centre)
  ctx.save();
  const matX=W*0.08, matY=H*0.10, matW=W*0.84, matH=H*0.80;
  const matGrad=ctx.createLinearGradient(matX,matY,matX,matY+matH);
  matGrad.addColorStop(0,'#1565c0'); matGrad.addColorStop(0.5,'#1976d2'); matGrad.addColorStop(1,'#0d47a1');
  ctx.fillStyle=matGrad; ctx.beginPath(); roundRect(ctx,matX,matY,matW,matH,8); ctx.fill();
  // Mat boundary line
  ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=2;
  ctx.beginPath(); roundRect(ctx,matX+8,matY+8,matW-16,matH-16,6); ctx.stroke();
  ctx.restore();
  // Balance beam (centre)
  const beamY=H*0.58, beamW=W*0.52, beamH=Math.max(6,H*0.018);
  const beamX=(W-beamW)/2;
  ctx.save();
  const beamG=ctx.createLinearGradient(beamX,beamY,beamX,beamY+beamH);
  beamG.addColorStop(0,'#d2b48c'); beamG.addColorStop(0.5,'#c4a06a'); beamG.addColorStop(1,'#a8844a');
  ctx.fillStyle=beamG; ctx.fillRect(beamX,beamY,beamW,beamH);
  // Beam legs
  const legW=Math.max(3,W*0.008), legH=H*0.10;
  ctx.fillStyle='#8a8a8a';
  ctx.fillRect(beamX+beamW*0.12,beamY+beamH,legW,legH);
  ctx.fillRect(beamX+beamW*0.88-legW,beamY+beamH,legW,legH);
  // Beam base
  ctx.fillStyle='#666'; ctx.fillRect(beamX+beamW*0.08,beamY+beamH+legH,beamW*0.16,Math.max(3,H*0.008));
  ctx.fillRect(beamX+beamW*0.76,beamY+beamH+legH,beamW*0.16,Math.max(3,H*0.008));
  ctx.restore();
  // Rings (left side)
  ctx.save();
  const ringCx=W*0.18, ringCy=H*0.32, ringR=Math.min(W,H)*0.045;
  // Cables
  ctx.strokeStyle='rgba(120,120,120,0.4)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(ringCx-ringR*1.2,H*0.02); ctx.lineTo(ringCx-ringR*1.2,ringCy-ringR); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ringCx+ringR*1.2,H*0.02); ctx.lineTo(ringCx+ringR*1.2,ringCy-ringR); ctx.stroke();
  // Rings
  ctx.strokeStyle='#5d4037'; ctx.lineWidth=Math.max(3,ringR*0.35); ctx.lineCap='round';
  ctx.beginPath(); ctx.arc(ringCx-ringR*1.2,ringCy,ringR,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(ringCx+ringR*1.2,ringCy,ringR,0,Math.PI*2); ctx.stroke();
  ctx.restore();
  // Uneven bars (right side)
  ctx.save();
  const barX=W*0.78, barLowY=H*0.42, barHighY=H*0.22;
  const barLen=W*0.10;
  ctx.strokeStyle='#5d4037'; ctx.lineWidth=Math.max(3,W*0.006); ctx.lineCap='round';
  // Low bar
  ctx.beginPath(); ctx.moveTo(barX-barLen/2,barLowY); ctx.lineTo(barX+barLen/2,barLowY); ctx.stroke();
  // High bar
  ctx.beginPath(); ctx.moveTo(barX-barLen/2,barHighY); ctx.lineTo(barX+barLen/2,barHighY); ctx.stroke();
  // Uprights
  ctx.strokeStyle='#999'; ctx.lineWidth=Math.max(2,W*0.004);
  ctx.beginPath(); ctx.moveTo(barX-barLen/2,barHighY); ctx.lineTo(barX-barLen/2,H*0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(barX+barLen/2,barHighY); ctx.lineTo(barX+barLen/2,H*0.55); ctx.stroke();
  ctx.restore();
  // Vault table (bottom left)
  ctx.save();
  const vx=W*0.22, vy=H*0.78, vw=W*0.12, vh=H*0.06;
  const vg=ctx.createLinearGradient(vx,vy,vx,vy+vh);
  vg.addColorStop(0,'#ddd'); vg.addColorStop(1,'#bbb');
  ctx.fillStyle=vg; ctx.beginPath(); roundRect(ctx,vx,vy,vw,vh,4); ctx.fill();
  ctx.strokeStyle='#999'; ctx.lineWidth=1; ctx.beginPath(); roundRect(ctx,vx,vy,vw,vh,4); ctx.stroke();
  // Vault legs
  ctx.fillStyle='#888';
  ctx.fillRect(vx+vw*0.15,vy+vh,Math.max(2,W*0.005),H*0.05);
  ctx.fillRect(vx+vw*0.85-2,vy+vh,Math.max(2,W*0.005),H*0.05);
  ctx.restore();
  // Pommel horse (bottom right)
  ctx.save();
  const px2=W*0.72, py2=H*0.80, pw2=W*0.14, ph2=H*0.045;
  const pg2=ctx.createLinearGradient(px2,py2,px2,py2+ph2);
  pg2.addColorStop(0,'#d2b48c'); pg2.addColorStop(1,'#b8956a');
  ctx.fillStyle=pg2; ctx.beginPath();
  ctx.ellipse(px2+pw2/2,py2+ph2/2,pw2/2,ph2/2,0,0,Math.PI*2); ctx.fill();
  // Pommels
  ctx.fillStyle='#666'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(px2+pw2*0.35,py2-2,Math.max(3,ph2*0.28),0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(px2+pw2*0.65,py2-2,Math.max(3,ph2*0.28),0,Math.PI*2); ctx.fill();
  ctx.restore();
  // Rhythmic ribbons — flowing curves in pink, purple, and teal
  ctx.save();
  const ribbonColors=['rgba(233,30,99,0.28)','rgba(156,39,176,0.22)','rgba(0,150,136,0.22)','rgba(255,152,0,0.18)'];
  const ribbonPaths=[
    [[0.05,0.20],[0.25,0.08],[0.45,0.25],[0.65,0.05],[0.85,0.18],[0.95,0.08]],
    [[0.02,0.88],[0.20,0.72],[0.40,0.90],[0.60,0.75],[0.80,0.92],[0.98,0.78]],
    [[0.08,0.50],[0.28,0.38],[0.48,0.55],[0.68,0.40],[0.88,0.52],[0.95,0.42]],
    [[0.92,0.15],[0.75,0.30],[0.58,0.18],[0.42,0.35],[0.25,0.20],[0.10,0.32]],
  ];
  ribbonPaths.forEach((pts,ri) => {
    ctx.strokeStyle=ribbonColors[ri]; ctx.lineWidth=Math.max(3,Math.min(W,H)*0.015); ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(W*pts[0][0],H*pts[0][1]);
    for(let i=1;i<pts.length-1;i+=2){
      const cp=pts[i], ep=pts[Math.min(i+1,pts.length-1)];
      ctx.quadraticCurveTo(W*cp[0],H*cp[1],W*ep[0],H*ep[1]);
    }
    ctx.stroke();
    // Ribbon flutter — small sine wave overlaid
    ctx.save(); ctx.globalAlpha=0.15; ctx.lineWidth=Math.max(1.5,Math.min(W,H)*0.008);
    ctx.beginPath();
    const startX=W*pts[0][0], endX=W*pts[pts.length-1][0];
    const startY=H*pts[0][1], endY=H*pts[pts.length-1][1];
    for(let t=0;t<=1;t+=0.02){
      const px3=startX+(endX-startX)*t;
      const py3=startY+(endY-startY)*t+Math.sin(t*Math.PI*6)*Math.min(W,H)*0.02;
      t===0?ctx.moveTo(px3,py3):ctx.lineTo(px3,py3);
    }
    ctx.stroke(); ctx.restore();
  });
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TICKET FILL FUNCTIONS
// Each sport's shape is large, central, and represents the ball/equipment.
// All textures are drawn AFTER ctx.clip() is already set by caller.
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: draw a sport shape path (no fill/stroke — caller does that)
// Returns { cx, cy, R } describing the shape centre and radius for content layout.
// cy_override: if provided, uses this as the vertical centre instead of y+h/2
function sportShapePath(ctx, x, y, w, h, sport, cy_override, maxR_override) {
  const cx=x+w/2;
  const cy = (cy_override !== undefined) ? cy_override : y+h/2;
  const Rraw=Math.min(w,h)*0.40;
  const R = (maxR_override !== undefined) ? Math.min(Rraw, maxR_override) : Rraw;
  switch(sport){
    case 'soccer': {
      const PR=R*1.05;
      ctx.beginPath();
      for(let i=0;i<5;i++){const a=(i*2*Math.PI/5)-Math.PI/2; i===0?ctx.moveTo(cx+Math.cos(a)*PR,cy+Math.sin(a)*PR):ctx.lineTo(cx+Math.cos(a)*PR,cy+Math.sin(a)*PR);}
      ctx.closePath();
      return {cx,cy,R:PR*0.85};
    }
    case 'football': {
      ctx.beginPath();
      ctx.ellipse(cx,cy,R*1.35,R*0.78,0,0,Math.PI*2);
      ctx.closePath();
      return {cx,cy,R:R*0.78};
    }
    case 'afl':
    case 'rugby': {
      // Same oval as football — the rugby/AFL ball is an elongated prolate
      // spheroid, so the shape reads correctly at every aspect ratio.
      ctx.beginPath();
      ctx.ellipse(cx,cy,R*1.35,R*0.78,0,0,Math.PI*2);
      ctx.closePath();
      return {cx,cy,R:R*0.78};
    }
    case 'wrestling': {
      // Octagon shape for wrestling/MMA
      ctx.beginPath();
      for(let i=0;i<8;i++){const a=(i*Math.PI/4)-Math.PI/8;i===0?ctx.moveTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R):ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);}
      ctx.closePath();
      return {cx,cy,R:R*0.92};
    }
    case 'baseball':
    case 'softball': {
      // Home plate pentagon — pointed top (toward pitcher), flat bottom (toward catcher)
      // Slightly enlarged so French text (MOITIÉ-MOITIÉ) fits comfortably inside.
      const hw  = R * 1.00;          // half-width (was 0.90)
      const apy = cy - R * 1.00;     // apex Y (was -0.90)
      const shy = cy - R * 0.20;     // shoulder Y (was -0.18)
      const bty = cy + R * 0.68;     // bottom Y (was +0.60)
      ctx.beginPath();
      ctx.moveTo(cx,        apy);    // 1. apex (top point)
      ctx.lineTo(cx + hw,   shy);    // 2. right shoulder
      ctx.lineTo(cx + hw,   bty);    // 3. right bottom
      ctx.lineTo(cx - hw,   bty);    // 4. left bottom
      ctx.lineTo(cx - hw,   shy);    // 5. left shoulder
      ctx.closePath();
      // Effective inner radius — use a more generous factor so text has room
      const plateH = bty - apy;
      const effR = Math.min(hw * 0.72, plateH * 0.42);
      const plateCY = (apy + bty) / 2;
      return {cx, cy: plateCY, R: effR};
    }
    default: {
      ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.closePath();
      return {cx,cy,R};
    }
  }
}

// Draw the sport shape (backdrop behind logo / content)
// accentColor: [r,g,b] from uploaded image
// shapeFill: CSS colour string for the shape interior (default white, grey-card for white logos)
function drawSportBackdrop(ctx, x, y, w, h, sportKey, accentColor, darkestColor, cy_override, maxR_override, shapeFill) {
  const fill = shapeFill || '#ffffff';
  const [r,g,b]=accentColor;
  // Outer glow: draw shape slightly larger with blurred accent fill
  ctx.save();
  const shapeInfoGlow=sportShapePath(ctx,x,y,w,h,sportKey,cy_override,maxR_override);
  ctx.shadowColor=`rgba(${r},${g},${b},0.45)`;
  ctx.shadowBlur=18;
  ctx.fillStyle=`rgba(${r},${g},${b},0.18)`;
  ctx.fill();
  ctx.shadowBlur=0;
  ctx.restore();
  // For Ultimate Frisbee: 3-D bevel disc shape instead of plain white fill
  if (sportKey === 'ultimatefrisbee') {
    const shapeInfoF=sportShapePath(ctx,x,y,w,h,sportKey,cy_override,maxR_override);
    const {cx,cy,R}=shapeInfoF;
    // Outer rim gradient (dark edge → light inner)
    const rimGrad=ctx.createRadialGradient(cx-R*0.3,cy-R*0.3,R*0.3,cx,cy,R);
    rimGrad.addColorStop(0,'#f8f8ff'); rimGrad.addColorStop(0.7,'#e8e8f5'); rimGrad.addColorStop(1,'#b0b0d0');
    ctx.fillStyle=rimGrad; ctx.fill();
    // Bevel highlight arc (top-left)
    ctx.save(); ctx.globalAlpha=0.55; ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=R*0.07; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(cx,cy,R*0.92,Math.PI*1.1,Math.PI*1.8); ctx.stroke();
    ctx.restore();
    // Inner dome
    const domeGrad=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,R*0.05,cx,cy,R*0.75);
    domeGrad.addColorStop(0,'rgba(255,255,255,0.70)'); domeGrad.addColorStop(1,'rgba(230,230,255,0.10)');
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx,cy,R*0.75,R*0.35,0,0,Math.PI*2); ctx.fillStyle=domeGrad; ctx.fill(); ctx.restore();
    // Rim groove
    ctx.save(); ctx.globalAlpha=0.30; ctx.strokeStyle='#8080b0'; ctx.lineWidth=R*0.04;
    ctx.beginPath(); ctx.arc(cx,cy,R*0.88,0,Math.PI*2); ctx.stroke(); ctx.restore();
    // Border
    ctx.strokeStyle=`rgba(${r},${g},${b},0.65)`; ctx.lineWidth=2.5;
    sportShapePath(ctx,x,y,w,h,sportKey,cy_override,maxR_override); ctx.stroke();
    return sportShapePath(ctx,x,y,w,h,sportKey,cy_override,maxR_override);
  }
  // Solid fill (white by default, grey-card for white logos)
  const shapeInfo=sportShapePath(ctx,x,y,w,h,sportKey,cy_override,maxR_override);
  ctx.fillStyle=fill; ctx.fill();
  // Golf: draw dimple pattern inside the shape so the white circle reads as
  // an actual golf ball. Kept subtle enough that a logo or org-name text
  // rendered on top stays comfortably legible.
  if (sportKey === 'golf') {
    _drawGolfDimples(ctx, shapeInfo);
    // Rebuild the shape path — the dimple helper leaves a tiny highlight
    // arc as the current path, and the border stroke below strokes the
    // current path. Without this rebuild, the border would stroke the last
    // dimple's highlight and produce a small dark circle inside the shape.
    sportShapePath(ctx, x, y, w, h, sportKey, cy_override, maxR_override);
  }
  // Border — prefer a genuinely dark colour so the stroke reads as a proper
  // outline on the white shape at every ratio. Yellow/gold accents at 0.65
  // alpha previously produced a washed-out yellowy line; darkestColor from
  // the palette is used as the default now, with a safe darkened-accent
  // fallback when the palette lacks a truly dark colour.
  ctx.strokeStyle = _pickShapeStroke(darkestColor, [r, g, b]);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  return shapeInfo;
}

// Pick a stroke colour that reads clearly on a white shape:
//   1. Use darkestColor if it hits ≥ 4.5:1 contrast on white.
//   2. Otherwise darken the accent until it does.
//   3. Never let it go so dark it becomes indistinguishable black — target
//      luminance ≤ 0.35 which is comfortably visible without looking harsh.
function _pickShapeStroke(darkest, accent) {
  const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
  const contrast = (r,g,b) => 1.05 / (0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)+0.05);
  if (Array.isArray(darkest)) {
    const [dr,dg,db] = darkest;
    if (contrast(dr,dg,db) >= 4.5) return `rgb(${dr},${dg},${db})`;
  }
  if (Array.isArray(accent)) {
    let [r,g,b] = accent;
    let scale = 1.0;
    for (let i = 0; i < 20 && contrast(r*scale, g*scale, b*scale) < 4.5; i++) scale *= 0.82;
    return `rgb(${Math.round(r*scale)},${Math.round(g*scale)},${Math.round(b*scale)})`;
  }
  return '#1a1a1a';
}

// Golf-ball dimple texture: hexagonal grid of soft indented circles clipped
// to the shape. Each dimple gets a radial gradient (bright rim highlight →
// dark centre) so it reads as an inset rather than a printed dot. Kept low
// contrast so logos and text drawn on top stay legible at every ratio.
function _drawGolfDimples(ctx, shapeInfo) {
  const { cx, cy, R } = shapeInfo;
  if (!R || R <= 0) return;
  ctx.save();
  // Clip to a circle just inside the shape's border so dimples never touch
  // the outline. Using an arc here instead of sportShapePath because golf
  // shapes are always circular.
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.96, 0, Math.PI * 2);
  ctx.clip();

  const dimpleR = R * 0.055;
  const spacing = dimpleR * 2.35;
  const rowH    = spacing * 0.866;                  // sin(60°) — hexagonal
  const reach   = R * 0.94;
  const rows    = Math.ceil(reach / rowH) + 1;
  const cols    = Math.ceil(reach / spacing) + 1;

  for (let ry = -rows; ry <= rows; ry++) {
    const py = cy + ry * rowH;
    const xShift = (Math.abs(ry) % 2 === 0) ? 0 : spacing / 2;
    for (let rx = -cols; rx <= cols; rx++) {
      const px = cx + rx * spacing + xShift;
      // Only draw dimples whose centres sit inside the ball
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy > reach * reach) continue;

      // Radial gradient for a subtle indented look — light rim then a soft
      // grey centre. The subtle asymmetric highlight comes from painting a
      // small bright dot offset up-and-left after the gradient.
      const grad = ctx.createRadialGradient(px, py, 0, px, py, dimpleR);
      grad.addColorStop(0.00, 'rgba(200,200,205,0.35)');
      grad.addColorStop(0.55, 'rgba(220,220,225,0.18)');
      grad.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, dimpleR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(px - dimpleR * 0.30, py - dimpleR * 0.30, dimpleR * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Clip future drawing to the sport shape
function clipToSportShape(ctx, x, y, w, h, sportKey, cy_override) {
  sportShapePath(ctx,x,y,w,h,sportKey,cy_override);
  ctx.clip();
  return sportShapePath(ctx,x,y,w,h,sportKey,cy_override);
}

/* ═══════════════════════════════════════════════════════════════
   BRAND PALETTE EXTRACTION
   Extracts 5 key colours from an uploaded logo using ColorThief,
   stores them in window.brandPalette, and powers the palette UI.
═══════════════════════════════════════════════════════════════ */
// brandPalette is seeded near the top of the file from the Banner Colors
// pickers so the very first render (before any logo upload) has valid
// hex strings for every key. Do not reset it to null here — that would
// wipe the seed and leave the logoless render path with no palette.

function _rgbToHexStr(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function hexToRgbArr(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function extractBrandPaletteFromImg(imgEl) {
  try {
    const palette = getPaletteCached(imgEl, 12);
    function lumC(c) { return (0.299*c[0] + 0.587*c[1] + 0.114*c[2]) / 255; }
    function satC(c) { const mx=Math.max(c[0],c[1],c[2]), mn=Math.min(c[0],c[1],c[2]); return mx===0?0:(mx-mn)/mx; }
    const filtered = palette.filter(c => { const l=lumC(c); return l>0.04 && l<0.96; });
    const all = filtered.length >= 4 ? filtered : palette;
    const byLum = [...all].sort((a,b) => lumC(a) - lumC(b));
    const bySat = [...all].sort((a,b) => satC(b) - satC(a));
    return {
      dark:    _rgbToHexStr(byLum[0][0], byLum[0][1], byLum[0][2]),
      primary: _rgbToHexStr(...(byLum[Math.floor(byLum.length * 0.25)] || byLum[0])),
      accent:  _rgbToHexStr(bySat[0][0], bySat[0][1], bySat[0][2]),
      mid:     _rgbToHexStr(...(byLum[Math.floor(byLum.length * 0.6)]  || byLum[byLum.length-2])),
      light:   _rgbToHexStr(byLum[byLum.length-1][0], byLum[byLum.length-1][1], byLum[byLum.length-1][2]),
    };
  } catch(e) {
    return { dark:'#111111', primary:'#1e4d8c', accent:'#c0392b', mid:'#7f8c8d', light:'#ecf0f1' };
  }
}

// ── Checkerboard detection warning ────────────────────────────────────────────
// Scans border pixels for the alternating grey/white pattern that indicates
// a "baked-in" transparency checkerboard. Shows a warning modal if detected.
function _warnIfCheckerboard(img, label) {
  try {
    const sz = Math.min(img.width, 200);
    const sc = sz / img.width;
    const sw = Math.round(img.width * sc) || 1;
    const sh = Math.round(img.height * sc) || 1;
    const oc = document.createElement('canvas'); oc.width = sw; oc.height = sh;
    const ctx = oc.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;

    // Collect greyscale border values
    const gv = [];
    function scan(x, y) {
      if (x < 0 || x >= sw || y < 0 || y >= sh) return;
      const i = (y * sw + x) * 4;
      const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
      if (a < 30) return;
      const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
      if (mx > 0 && (mx-mn)/mx > 0.12) return;
      gv.push(r);
    }
    for (let row = 0; row < Math.min(sh, 6); row++)
      for (let x = 0; x < sw; x++) scan(x, row);
    for (let row = Math.max(0, sh-6); row < sh; row++)
      for (let x = 0; x < sw; x++) scan(x, row);
    for (let y = 0; y < sh; y++) { scan(0, y); scan(sw-1, y); }
    if (gv.length < 20) return;

    // Histogram peaks
    const hist = new Array(256).fill(0);
    gv.forEach(v => hist[v]++);
    const sm = new Array(256).fill(0);
    for (let i = 2; i < 254; i++) sm[i] = hist[i-2]+hist[i-1]*2+hist[i]*3+hist[i+1]*2+hist[i+2];
    let pk1=0,pk1v=0;
    for (let i=100;i<256;i++) { if(sm[i]>pk1v){pk1v=sm[i];pk1=i;} }
    let pk2=0,pk2v=0;
    for (let i=100;i<256;i++) { if(Math.abs(i-pk1)<8)continue; if(sm[i]>pk2v){pk2v=sm[i];pk2=i;} }
    if (!pk1v || !pk2v) return;
    const loG=Math.min(pk1,pk2), hiG=Math.max(pk1,pk2), diff=hiG-loG;
    if (diff<5 || diff>60 || pk2v<pk1v*0.10) return;

    // Verify alternation
    const tolC = Math.max(10, Math.round(diff*0.6));
    const rangeLo = loG - tolC, rangeHi = hiG + tolC;
    function inR(r,g,b,a){
      if(a<30)return false;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      if(mx>0&&(mx-mn)/mx>0.15)return false;
      return r>=rangeLo&&r<=rangeHi;
    }
    function tV(r){return r<=(loG+hiG)/2?0:1;}
    let trans=0,abN=0;
    for(let row=0;row<Math.min(sh,4);row++){
      let pv=-1;
      for(let x=0;x<sw;x++){
        const i=(row*sw+x)*4;
        if(!inR(d[i],d[i+1],d[i+2],d[i+3]))continue;
        const v=tV(d[i]); abN++; if(pv>=0&&v!==pv)trans++; pv=v;
      }
    }
    if (abN/(Math.min(sh,4)*sw) < 0.50 || trans < 6) return;

    // Checkerboard detected — show warning
    _showCheckerboardWarning(label);
  } catch(e) { /* silent fail */ }
}

function _showCheckerboardWarning(label) {
  // Remove any existing warning
  const existing = document.getElementById('cbWarningOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cbWarningOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  overlay.innerHTML = `
    <div style="background:white;border-radius:14px;max-width:520px;width:100%;padding:28px 30px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.25);font-family:'Plus Jakarta Sans',system-ui,sans-serif;position:relative;">
      <button onclick="this.closest('#cbWarningOverlay').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:20px;color:#999;cursor:pointer;line-height:1;">&times;</button>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
        <span style="font-size:1.6rem;">⚠️</span>
        <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#b45309;">Checkerboard Background Detected</h3>
      </div>
      <p style="margin:0 0 14px;font-size:0.82rem;color:#475467;line-height:1.65;">
        The uploaded <strong>${label}</strong> appears to contain a <strong>baked-in checkerboard pattern</strong> — the grey-and-white grid that some image editors display to represent transparency. This pattern is embedded in the image pixels and <strong>cannot be automatically removed</strong>.
      </p>
      <div style="background:#f8f8fa;border:1px solid #e4e7ed;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
        <p style="margin:0 0 6px;font-size:0.72rem;font-weight:700;color:#344054;text-transform:uppercase;letter-spacing:0.06em;">Example of a checkerboard background:</p>
        <svg width="200" height="60" viewBox="0 0 200 60" style="display:block;border-radius:4px;border:1px solid #ddd;">
          ${(function(){
            let rects='';
            for(let r=0;r<6;r++) for(let c=0;c<20;c++){
              const fill=(r+c)%2===0?'#cccccc':'#ffffff';
              rects+='<rect x="'+(c*10)+'" y="'+(r*10)+'" width="10" height="10" fill="'+fill+'"/>';
            }
            // Draw a simple star shape on top to illustrate logo on checkerboard
            return rects + '<path d="M100,8 L108,24 L126,26 L113,38 L116,56 L100,48 L84,56 L87,38 L74,26 L92,24 Z" fill="white" stroke="#eee" stroke-width="0.5"/>';
          })()}
        </svg>
      </div>
      <p style="margin:0 0 6px;font-size:0.78rem;font-weight:700;color:#344054;">How to fix this:</p>
      <ul style="margin:0 0 16px;padding-left:18px;font-size:0.80rem;color:#475467;line-height:1.7;">
        <li>Open the image in an image editor (Photoshop, GIMP, Canva, etc.)</li>
        <li>Export / Save As a <strong>PNG file with transparency</strong> enabled</li>
        <li>Ensure the background is truly transparent (no checkerboard baked in)</li>
        <li>Re-upload the corrected file</li>
      </ul>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button onclick="this.closest('#cbWarningOverlay').remove()" style="padding:8px 20px;border-radius:7px;border:1.5px solid #d0d5dd;background:white;color:#344054;font-family:inherit;font-size:0.78rem;font-weight:600;cursor:pointer;">
          Continue Anyway
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showBrandPaletteStrip(imgEl) {
  let pal = extractBrandPaletteFromImg(imgEl);
  if (isLogoMostlyWhite(imgEl)) {
    // White logo: ColorThief extracts useless near-whites.
    // Replace with a practical dark-to-mid slate palette the user can work from immediately.
    pal = {
      dark:    '#1a1a2e',   // near-black navy
      primary: '#2c3e6b',   // deep blue
      accent:  '#c0392b',   // strong red — visible accent
      mid:     '#5a6a8a',   // mid slate-blue
      light:   '#b0bac8',   // soft blue-grey
    };
    pal.shapefill = '#d4d4d4'; // grey card so white logo is visible
  } else {
    pal.shapefill = '#ffffff';
  }
  window.brandPalette = pal;
  _updatePaletteUI(pal);
  document.getElementById('brandPaletteStrip').style.display = 'block';
}

function _updatePaletteUI(pal) {
  ['dark','primary','accent','mid','light'].forEach(key => {
    const sw  = document.getElementById('bp-' + key);
    const inp = document.getElementById('bp-color-' + key);
    if (sw)  sw.style.background = pal[key];
    if (inp) inp.value = pal[key];
  });
  // Shape fill swatch — only shown when a value has been set
  const sfWrap = document.getElementById('bp-shapefill-wrap');
  const sfSw   = document.getElementById('bp-shapefill');
  const sfInp  = document.getElementById('bp-color-shapefill');
  if (pal.shapefill) {
    if (sfWrap) sfWrap.style.display = '';
    if (sfSw)  sfSw.style.background = pal.shapefill;
    if (sfInp) sfInp.value = pal.shapefill;
  } else {
    if (sfWrap) sfWrap.style.display = 'none';
  }
}

function setBrandSwatchColor(key, hex) {
  if (!window.brandPalette) window.brandPalette = {};
  window.brandPalette[key] = hex;
  const sw = document.getElementById('bp-' + key);
  if (sw) sw.style.background = hex;
  const canvas = document.getElementById('preview');
  if (canvas && canvas.classList.contains('visible')) {
    clearTimeout(_autoPreviewTimer);
    try { generatePoster(); } catch(e) {}
  }
}

function resetBrandPalette() {
  const file = document.getElementById('logoUpload').files[0];
  if (!file) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    showBrandPaletteStrip(img);
    clearTimeout(_autoPreviewTimer);
    try { generatePoster(); } catch(e) {}
  };
  img.src = URL.createObjectURL(file);
}

function hideBrandPaletteStrip() {
  window.brandPalette = null;
  document.getElementById('brandPaletteStrip').style.display = 'none';
}

// Get dominant color from an image element
function getDominantColor(img) {
  try {
    const p = getPaletteCached(img, 6);
    // Pick most saturated non-too-dark color
    let best=p[0], bestScore=-1;
    for(const [r,g,b] of p){
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
      const sat=mx===0?0:(mx-mn)/mx;
      const bri=mx/255;
      if(bri<0.08) continue;
      const score=sat*(0.4+bri*0.6);
      if(score>bestScore){bestScore=score;best=[r,g,b];}
    }
    return best;
  } catch(e){ return [80,80,80]; }
}

// ── Background removal ────────────────────────────────────────────────────────
// Removes the outer background using BFS flood-fill from image edges only.
// Does NOT touch interior pixels — avoids destroying logo colours that happen
// to be similar to the background.
function removeImageBackground(img) {
  const oc=document.createElement('canvas');
  oc.width=img.width; oc.height=img.height;
  const oc2=oc.getContext('2d',{willReadFrequently:true});
  oc2.drawImage(img,0,0);
  const id=oc2.getImageData(0,0,oc.width,oc.height);
  const d=id.data, W=oc.width, H=oc.height;

  // Sample border pixels to detect background colour
  const samplePts=[
    [0,0],[W-1,0],[0,H-1],[W-1,H-1],
    [Math.floor(W/2),0],[0,Math.floor(H/2)],
    [W-1,Math.floor(H/2)],[Math.floor(W/2),H-1],
    [2,2],[W-3,2],[2,H-3],[W-3,H-3]
  ];
  function getPixel(x,y){const i=(y*W+x)*4;return[d[i],d[i+1],d[i+2],d[i+3]];}
  const bgSamples=samplePts.map(([x,y])=>getPixel(x,y)).filter(p=>p[3]>200);

  if(bgSamples.length===0) return oc; // already transparent

  // Average background colour
  const bgR=bgSamples.reduce((s,p)=>s+p[0],0)/bgSamples.length;
  const bgG=bgSamples.reduce((s,p)=>s+p[1],0)/bgSamples.length;
  const bgB=bgSamples.reduce((s,p)=>s+p[2],0)/bgSamples.length;

  // Tight tolerance — only remove pixels very close to the bg colour
  // Adaptive: tighter for dark backgrounds to avoid eating into dark logo edges
  const _bgBri = (bgR + bgG + bgB) / 3;
  const tolerance = _bgBri < 40 ? 18 : 28;

  // BFS flood-fill strictly from border pixels outward — never touches interior
  const visited=new Uint8Array(W*H);
  const queue=[];
  function enqueue(x,y){
    if(x<0||x>=W||y<0||y>=H) return;
    const idx=y*W+x;
    if(visited[idx]) return;
    const pi=idx*4;
    if(d[pi+3]<10){ visited[idx]=1; return; } // already transparent — propagate but don't mark
    const dr=d[pi]-bgR, dg=d[pi+1]-bgG, db=d[pi+2]-bgB;
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    if(dist<tolerance){
      visited[idx]=1;
      queue.push(x,y);
    }
  }
  // Seed only from the outermost border row/column
  for(let x=0;x<W;x++){enqueue(x,0);enqueue(x,H-1);}
  for(let y=1;y<H-1;y++){enqueue(0,y);enqueue(W-1,y);}

  let qi=0;
  while(qi<queue.length){
    const x=queue[qi++], y=queue[qi++];
    const pi=(y*W+x)*4;
    const dr=d[pi]-bgR, dg=d[pi+1]-bgG, db=d[pi+2]-bgB;
    const dist=Math.sqrt(dr*dr+dg*dg+db*db);
    // Feather: pixels right at tolerance edge get partial alpha
    const alpha=Math.min(255, Math.round((dist/tolerance)*255*2.0));
    d[pi+3]=Math.min(d[pi+3], alpha);
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>enqueue(x+dx,y+dy));
  }

  // NO global second pass — do not touch non-connected interior pixels
  oc2.putImageData(id,0,0);
  return oc;
}

// Returns true ONLY if the logo contains no meaningful colour — i.e. it is a
// white, greyscale, or near-monochrome logo with no saturated artwork.
// A coloured logo that merely has a large white background will return FALSE
// because it contains enough saturated coloured pixels.
function isLogoMostlyWhite(img) {
  const oc=document.createElement('canvas');
  oc.width=Math.min(img.width,120); oc.height=Math.min(img.height,120);
  const oc2=oc.getContext('2d',{willReadFrequently:true});
  oc2.drawImage(img,0,0,oc.width,oc.height);
  const d=oc2.getImageData(0,0,oc.width,oc.height).data;
  let opaquePx=0, colouredPx=0;
  for(let i=0;i<d.length;i+=4){
    if(d[i+3]<30) continue; // skip transparent
    opaquePx++;
    const r=d[i],g=d[i+1],b=d[i+2];
    // Compute saturation — a "coloured" pixel has meaningful hue
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    const sat = mx===0 ? 0 : (mx-mn)/mx;
    const bri = mx/255;
    // Count as coloured if saturation >15% and not too dark
    if(sat>0.15 && bri>0.12) colouredPx++;
  }
  if(opaquePx===0) return false;
  // If more than 4% of opaque pixels are coloured, it is a coloured logo
  // sitting on a white background — NOT a white-only logo
  return (colouredPx/opaquePx) < 0.04;
}
function fillPuck(ctx, x, y, w, h) {
  // Slightly lighter charcoal surface — authentic vulcanised rubber
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#383838'); g.addColorStop(0.5,'#242424'); g.addColorStop(1,'#2e2e2e');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Fine rubber grain (tiny horizontal moulded tread lines)
  ctx.save(); ctx.globalAlpha=0.11; ctx.strokeStyle='#a0a0a0'; ctx.lineWidth=0.8;
  for(let i=0;i<22;i++){
    const ly2=y+h*0.05+i*(h*0.90/22);
    ctx.beginPath(); ctx.moveTo(x,ly2); ctx.lineTo(x+w,ly2); ctx.stroke();
  }
  ctx.restore();
  // Puck moulded rings — anchored to the sport shape's actual centre AND
  // sized relative to the shape's radius so the outer ring reads as a snug
  // halo around the white shape without ever bleeding into the text or icon
  // bands. Falls back to the original constants when shape geometry isn't
  // available (e.g. legacy callers).
  const _pkFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const _pkCx = x + w * 0.5;
  const _pkCy = _pkFo?.shapeCy ?? (y + h * 0.5);
  const _pkSR = _pkFo?.shapeR;
  const _pkOuterR = _pkSR ? _pkSR * 1.08 : Math.min(w, h) * 0.43;
  const _pkInnerR = _pkSR ? _pkSR * 0.80 : Math.min(w, h) * 0.32;
  // Outer moulded edge ring
  ctx.strokeStyle='rgba(110,110,110,0.70)'; ctx.lineWidth=10;
  ctx.beginPath(); ctx.arc(_pkCx,_pkCy,_pkOuterR,0,Math.PI*2); ctx.stroke();
  // Inner ring — subtle second moulded circle
  ctx.strokeStyle='rgba(80,80,80,0.30)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(_pkCx,_pkCy,_pkInnerR,0,Math.PI*2); ctx.stroke();
  // Surface reflection / sheen
  const sheen=ctx.createRadialGradient(x+w*0.35,y+h*0.25,5,x+w*0.35,y+h*0.25,w*0.55);
  sheen.addColorStop(0,'rgba(255,255,255,0.20)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillPuckLeft=fillPuck, fillPuckRight=fillPuck;

// ── SOCCER BALL — classic black-and-white pentagon patches ───────────────────
// Shared helper: draw B&W soccer ball centred at (cx,cy) with given radius r
function drawSoccerBallBW(ctx, cx, cy, r) {
  const pR = r * 0.295; // circumscribed pentagon patch radius
  // stroke width scales with ball size
  const sw = Math.max(0.7, r * 0.028);
  function pentagon(px, py, pr2, filled) {
    ctx.beginPath();
    for(let i=0;i<5;i++){
      const a=(i*2*Math.PI/5)-Math.PI/2;
      if(i===0) ctx.moveTo(px+Math.cos(a)*pr2, py+Math.sin(a)*pr2);
      else       ctx.lineTo(px+Math.cos(a)*pr2, py+Math.sin(a)*pr2);
    }
    ctx.closePath();
    if(filled){ ctx.fillStyle='#1a1a1a'; ctx.fill(); }
    ctx.strokeStyle='#1a1a1a'; ctx.lineWidth=sw; ctx.stroke();
  }
  pentagon(cx, cy, pR, true); // centre patch
  const d = r * 0.595;        // distance from ball centre to surrounding patch centres
  for(let j=0;j<5;j++){
    const a=(j*2*Math.PI/5)-Math.PI/2;
    pentagon(cx+Math.cos(a)*d, cy+Math.sin(a)*d, pR, true);
  }
}
function fillSoccerBall(ctx, x, y, w, h) {
  // Faint grass playing surface
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#c8e6c9'); gf.addColorStop(0.55,'#a5d6a7'); gf.addColorStop(1,'#81c784');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  // Mowed stripes
  ctx.save(); ctx.globalAlpha=0.10;
  for(let i=0;i<10;i++){
    ctx.fillStyle=i%2?'rgba(0,70,0,0.3)':'rgba(120,200,80,0.2)';
    ctx.fillRect(x+i*(w/10),y,w/10,h);
  }
  ctx.restore();
  // Faint centre circle (field marking)
  ctx.save(); ctx.globalAlpha=0.22; ctx.strokeStyle='white'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(x+w/2,y+h/2,Math.min(w,h)*0.36,0,Math.PI*2); ctx.stroke();
  // Halfway line
  ctx.beginPath(); ctx.moveTo(x,y+h/2); ctx.lineTo(x+w,y+h/2); ctx.stroke();
  ctx.restore();
  // Ball pattern directly on the field (no white circle base — the shape fill handles that).
  // Anchor the ball to the shape's centre (when available) so its outer pentagon
  // patches don't leak past the pentagon shape's vertices. Radius is also
  // reduced slightly so patches sit safely inside the pentagon's inscribed
  // circle across every aspect ratio.
  const _fo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const _ballCy = _fo?.shapeCy ?? (y + h / 2);
  const _ballR  = Math.min(w, h) * 0.30;
  drawSoccerBallBW(ctx, x + w / 2, _ballCy, _ballR);
  const sheen=ctx.createRadialGradient(x+w*0.32,y+h*0.26,4,x+w/2,y+h/2,Math.min(w,h)*0.42);
  sheen.addColorStop(0,'rgba(255,255,255,0.45)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillSoccerBallLeft=fillSoccerBall, fillSoccerBallRight=fillSoccerBall;

function _footballBase(ctx, x, y, w, h) {
  // Deep reddish-brown leather gradient
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#5c2206'); g.addColorStop(0.30,'#7a3010'); g.addColorStop(0.65,'#6b2808'); g.addColorStop(1,'#4a1a04');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Pebbled leather texture — scattered bumps with shadow/highlight per bump
  const pr0 = Math.max(2, Math.min(Math.min(w,h)*0.018, 11));
  ctx.save();
  const pN = 340;
  for(let i=0;i<pN;i++){
    const px=x+((i*139+7)%997)/997*w;
    const py=y+((i*107+53)%991)/991*h;
    const sz=pr0*(0.55+((i*23)%8)*0.08);
    // Drop shadow (offset down-right)
    ctx.globalAlpha=0.30; ctx.fillStyle='#130600';
    ctx.beginPath(); ctx.arc(px+sz*0.55,py+sz*0.6,sz*0.88,0,Math.PI*2); ctx.fill();
    // Pebble body (slightly raised, warm tint)
    ctx.globalAlpha=0.15; ctx.fillStyle='#c06828';
    ctx.beginPath(); ctx.arc(px,py,sz,0,Math.PI*2); ctx.fill();
    // Tiny highlight at top-left of bump
    ctx.globalAlpha=0.09; ctx.fillStyle='#e8a060';
    ctx.beginPath(); ctx.arc(px-sz*0.25,py-sz*0.28,sz*0.52,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  // Upper-left sheen
  const sheen=ctx.createRadialGradient(x+w*0.28,y+h*0.22,3,x+w*0.28,y+h*0.22,Math.max(w,h)*0.62);
  sheen.addColorStop(0,'rgba(210,130,55,0.19)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
function fillFootballLeft(ctx, x, y, w, h) {
  _footballBase(ctx,x,y,w,h);
}
function fillFootballRight(ctx, x, y, w, h) {
  _footballBase(ctx,x,y,w,h);
}

// ── BASEBALL ─────────────────────────────────────────────────────────────────
function fillBaseball(ctx, x, y, w, h) {
  // Outfield green base
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#4caf50'); gf.addColorStop(1,'#388e3c');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  // Mowed outfield stripes
  ctx.save(); ctx.globalAlpha=0.10;
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'rgba(0,50,0,0.4)':'rgba(120,220,80,0.3)';ctx.fillRect(x+i*(w/8),y,w/8,h);}
  ctx.restore();
  // Infield dirt arc
  const dcx=x+w/2, dcy=y+h*0.70, ds=Math.min(w,h)*0.32;
  ctx.save();
  ctx.fillStyle='rgba(180,120,60,0.50)';
  ctx.beginPath();
  ctx.moveTo(dcx,dcy-ds); ctx.lineTo(dcx+ds,dcy); ctx.lineTo(dcx,dcy+ds*0.55); ctx.lineTo(dcx-ds,dcy);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Foul lines
  ctx.save(); ctx.globalAlpha=0.30; ctx.strokeStyle='white'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.08); ctx.lineTo(x+w*0.04,y+h*0.96); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.08); ctx.lineTo(x+w*0.96,y+h*0.96); ctx.stroke();
  ctx.restore();
  // Diamond baselines — white strokes
  const home=[dcx,dcy+ds*0.50], first=[dcx+ds,dcy], second=[dcx,dcy-ds], third=[dcx-ds,dcy];
  ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.72)'; ctx.lineWidth=Math.max(2,w*0.005);
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(...home); ctx.lineTo(...first); ctx.lineTo(...second); ctx.lineTo(...third); ctx.lineTo(...home); ctx.stroke();
  ctx.restore();
  // Base squares
  const bsz=Math.max(5,w*0.022);
  function drawBaseAccent(px,py){ ctx.save();ctx.translate(px,py);ctx.rotate(Math.PI/4);ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fillRect(-bsz/2,-bsz/2,bsz,bsz);ctx.restore(); }
  drawBaseAccent(first[0],first[1]); drawBaseAccent(second[0],second[1]); drawBaseAccent(third[0],third[1]);
  // Pitcher's mound
  ctx.fillStyle='rgba(210,160,90,0.55)';
  ctx.beginPath(); ctx.arc(dcx,dcy-ds*0.35,Math.max(4,w*0.014),0,Math.PI*2); ctx.fill();
  // Subtle sheen
  const sheen=ctx.createRadialGradient(x+w*0.35,y+h*0.25,5,x+w*0.35,y+h*0.25,w*0.5);
  sheen.addColorStop(0,'rgba(255,255,255,0.22)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillBaseballLeft=fillBaseball, fillBaseballRight=fillBaseball;

// ── SOFTBALL ─────────────────────────────────────────────────────────────────
function fillSoftball(ctx, x, y, w, h) {
  // Outfield green base — brighter for softball
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#66bb6a'); gf.addColorStop(1,'#43a047');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  // Outfield stripes
  ctx.save(); ctx.globalAlpha=0.09;
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'rgba(0,60,0,0.35)':'rgba(130,230,90,0.25)';ctx.fillRect(x+i*(w/8),y,w/8,h);}
  ctx.restore();
  // Infield dirt — yellow-tinged for softball
  const dcx=x+w/2, dcy=y+h*0.70, ds=Math.min(w,h)*0.32;
  ctx.save();
  ctx.fillStyle='rgba(195,150,60,0.48)';
  ctx.beginPath();
  ctx.moveTo(dcx,dcy-ds); ctx.lineTo(dcx+ds,dcy); ctx.lineTo(dcx,dcy+ds*0.55); ctx.lineTo(dcx-ds,dcy);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // Foul lines
  ctx.save(); ctx.globalAlpha=0.28; ctx.strokeStyle='white'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.08); ctx.lineTo(x+w*0.04,y+h*0.96); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.08); ctx.lineTo(x+w*0.96,y+h*0.96); ctx.stroke();
  ctx.restore();
  // Diamond baselines — white strokes
  const home=[dcx,dcy+ds*0.50], first=[dcx+ds,dcy], second=[dcx,dcy-ds], third=[dcx-ds,dcy];
  ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.72)'; ctx.lineWidth=Math.max(2,w*0.005);
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(...home); ctx.lineTo(...first); ctx.lineTo(...second); ctx.lineTo(...third); ctx.lineTo(...home); ctx.stroke();
  ctx.restore();
  // Base squares
  const bsz=Math.max(5,w*0.022);
  function drawBaseAccent(px,py){ ctx.save();ctx.translate(px,py);ctx.rotate(Math.PI/4);ctx.fillStyle='rgba(255,255,255,0.85)';ctx.fillRect(-bsz/2,-bsz/2,bsz,bsz);ctx.restore(); }
  drawBaseAccent(first[0],first[1]); drawBaseAccent(second[0],second[1]); drawBaseAccent(third[0],third[1]);
  // Pitcher's mound
  ctx.fillStyle='rgba(210,160,90,0.50)';
  ctx.beginPath(); ctx.arc(dcx,dcy-ds*0.35,Math.max(4,w*0.014),0,Math.PI*2); ctx.fill();
  // Subtle sheen
  const sheen=ctx.createRadialGradient(x+w*0.35,y+h*0.25,5,x+w*0.35,y+h*0.25,w*0.5);
  sheen.addColorStop(0,'rgba(255,255,255,0.22)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillSoftballLeft=fillSoftball, fillSoftballRight=fillSoftball;

// ── BASKETBALL ───────────────────────────────────────────────────────────────
function fillBasketball(ctx, x, y, w, h) {
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#e65100'); g.addColorStop(0.5,'#f57c00'); g.addColorStop(1,'#e65100');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Court centre circle + centre-line midcourt stripe now share the shape's
  // vertical centre so the "half-court" reads as one aligned composition
  // behind the white shape at every aspect ratio. The centre circle is
  // sized relative to shapeR so it stays a snug halo around the white
  // shape and never bleeds into the text or icon bands.
  const _bbFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const _bbCx = x + w * 0.5;
  const _bbCy = _bbFo?.shapeCy ?? (y + h * 0.5);
  const _bbSR = _bbFo?.shapeR;
  const _bbCircleR = _bbSR ? _bbSR * 1.08 : Math.min(w, h) * 0.42;
  ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.arc(_bbCx,_bbCy,_bbCircleR,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.05); ctx.lineTo(x+w*0.5,y+h*0.95); ctx.stroke();
  ctx.beginPath(); ctx.arc(x-w*0.35,_bbCy,w*0.7,-0.5,0.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+w*1.35,_bbCy,w*0.7,Math.PI-0.5,Math.PI+0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.05,_bbCy); ctx.lineTo(x+w*0.95,_bbCy); ctx.stroke();
  const sheen=ctx.createRadialGradient(x+w*0.3,y+h*0.25,5,x+w*0.3,y+h*0.25,w*0.55);
  sheen.addColorStop(0,'rgba(255,220,180,0.3)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillBasketballLeft=fillBasketball, fillBasketballRight=fillBasketball;

// ── WATER POLO BALL ── with watery pool appearance
function fillWaterPolo(ctx, x, y, w, h) {
  // Deep pool water base
  const gw=ctx.createLinearGradient(x,y,x,y+h);
  gw.addColorStop(0,'#1565c0'); gw.addColorStop(0.5,'#1976d2'); gw.addColorStop(1,'#0d47a1');
  ctx.fillStyle=gw; ctx.fillRect(x,y,w,h);
  // Caustic light patterns (watery shimmer)
  ctx.save(); ctx.globalAlpha=0.14;
  for(let i=0;i<6;i++){
    const cx2=x+w*(0.1+i*0.15), cy2=y+h*(0.2+i*0.12);
    const gr2=ctx.createRadialGradient(cx2,cy2,2,cx2,cy2,w*0.18);
    gr2.addColorStop(0,'rgba(160,220,255,0.9)'); gr2.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr2; ctx.fillRect(x,y,w,h);
  }
  ctx.restore();
  // Pool lane ropes — horizontal dashed lines
  ctx.save(); ctx.globalAlpha=0.28; ctx.lineCap='round';
  [0.22,0.44,0.66,0.78].forEach(t=>{
    const ly=y+h*t;
    ctx.strokeStyle=t===0.44?'#ff1744':'#ffca28'; ctx.lineWidth=3;
    ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(x,ly); ctx.lineTo(x+w,ly); ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.restore();
  // Water ripple waves
  ctx.save(); ctx.globalAlpha=0.20; ctx.strokeStyle='#90caf9'; ctx.lineWidth=1.2;
  for(let i=0;i<5;i++){
    const wy=y+h*(0.1+i*0.18);
    ctx.beginPath();
    for(let px=x;px<=x+w;px+=5){const rp=wy+Math.sin((px-x)/w*Math.PI*8+i)*3; px===x?ctx.moveTo(px,rp):ctx.lineTo(px,rp);}
    ctx.stroke();
  }
  ctx.restore();
  // Ball + splash rings — anchor to the shape's actual centre so the
  // concentric splash arcs stay aligned with the white shape when the shape
  // is band-centred (previously the rings drifted when cy != y+h*0.42).
  const _wpFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const bcx = x + w / 2;
  const bcy = _wpFo?.shapeCy ?? (y + h * 0.42);
  const br  = Math.min(w, h) * 0.23;
  ctx.fillStyle='#ffffff';
  ctx.beginPath(); ctx.arc(bcx,bcy,br,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(21,101,192,0.70)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(bcx,bcy,br,0,Math.PI*2); ctx.stroke();
  // Hex panel lines
  ctx.strokeStyle='rgba(21,101,192,0.40)'; ctx.lineWidth=1;
  [[0,-0.7],[0.6,0.35],[-0.6,0.35]].forEach(([dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(bcx,bcy); ctx.lineTo(bcx+dx*br,bcy+dy*br); ctx.stroke();
  });
  // Splash ring
  ctx.save(); ctx.globalAlpha=0.35; ctx.strokeStyle='rgba(180,230,255,0.8)'; ctx.lineWidth=2;
  for(let r2=0;r2<3;r2++){ctx.beginPath();ctx.arc(bcx,bcy,br*(1.1+r2*0.18),0,Math.PI*2);ctx.stroke();}
  ctx.restore();
  const sheen=ctx.createRadialGradient(bcx-br*0.3,bcy-br*0.3,3,bcx,bcy,br);
  sheen.addColorStop(0,'rgba(255,255,255,0.55)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillWaterPoloLeft=fillWaterPolo, fillWaterPoloRight=fillWaterPolo;

// ── VOLLEYBALL ── with court playing surface
function fillVolleyball(ctx, x, y, w, h) {
  // Sand/indoor court warm wood floor
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#ffe0b2'); gf.addColorStop(0.5,'#ffcc80'); gf.addColorStop(1,'#ffa726');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  // Wood floor planks
  ctx.save(); ctx.globalAlpha=0.10;
  for(let i=0;i<14;i++){
    const py=y+i*(h/14);
    ctx.strokeStyle='#a0600a'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(x,py); ctx.lineTo(x+w,py); ctx.stroke();
  }
  ctx.restore();
  // Court boundary lines
  ctx.save(); ctx.globalAlpha=0.35; ctx.strokeStyle='white'; ctx.lineWidth=2;
  const cm=w*0.06;
  ctx.strokeRect(x+cm,y+cm,w-cm*2,h-cm*2);
  // Attack lines (3m lines)
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x+cm,y+h*0.33); ctx.lineTo(x+w-cm,y+h*0.33); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+cm,y+h*0.67); ctx.lineTo(x+w-cm,y+h*0.67); ctx.stroke();
  // Centre line
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x+cm,y+h/2); ctx.lineTo(x+w-cm,y+h/2); ctx.stroke();
  ctx.restore();
  // Net over centre line
  ctx.save(); ctx.globalAlpha=0.45;
  ctx.strokeStyle='#5d4037'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x,y+h/2); ctx.lineTo(x+w,y+h/2); ctx.stroke();
  ctx.globalAlpha=0.15; ctx.strokeStyle='#3e2723'; ctx.lineWidth=0.8;
  for(let nx=x;nx<=x+w;nx+=w*0.065){ctx.beginPath();ctx.moveTo(nx,y+h*0.42);ctx.lineTo(nx,y+h*0.58);ctx.stroke();}
  ctx.restore();
  // Ball — anchor to shape centre so the ball sits entirely inside the white
  // shape's clipped area and never pokes out into the text/icon bands on the
  // upper ticket. Radius is also gently reduced so it sits comfortably within
  // the smallest colored zones.
  const _vbFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const _vbCx = x + w / 2;
  const _vbCy = _vbFo?.shapeCy ?? (y + h * 0.38);
  const _vbR  = Math.min(w, h) * 0.20;
  ctx.fillStyle='#fff8e1';
  ctx.beginPath(); ctx.arc(_vbCx,_vbCy,_vbR,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.18)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(_vbCx,_vbCy,_vbR,0,Math.PI*2); ctx.stroke();
  // Ball panel curves
  ctx.strokeStyle='rgba(100,80,20,0.35)'; ctx.lineWidth=1.2;
  [[0,1],[1,0],[0.7,0.7]].forEach(([dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(_vbCx-dx*_vbR,_vbCy-dy*_vbR); ctx.lineTo(_vbCx+dx*_vbR,_vbCy+dy*_vbR); ctx.stroke();
  });
  const sheen=ctx.createRadialGradient(x+w*0.35,y+h*0.25,5,x+w*0.35,y+h*0.25,w*0.5);
  sheen.addColorStop(0,'rgba(255,255,255,0.45)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillVolleyballLeft=fillVolleyball, fillVolleyballRight=fillVolleyball;

// ── RINGETTE RING ── with ice rink playing surface
function fillRingette(ctx, x, y, w, h) {
  // Ice surface — crisp white-blue
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#e3f2fd'); g.addColorStop(0.5,'#eef7ff'); g.addColorStop(1,'#ddeefa');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Ice skate marks — faint curved lines
  ctx.save(); ctx.globalAlpha=0.08; ctx.strokeStyle='#90b8d8'; ctx.lineWidth=0.8;
  for(let i=0;i<10;i++){
    const ly2=y+h*(0.05+i*0.095);
    ctx.beginPath(); ctx.moveTo(x,ly2); ctx.bezierCurveTo(x+w*0.25,ly2-3,x+w*0.75,ly2+3,x+w,ly2); ctx.stroke();
  }
  ctx.restore();
  // Rink boundary
  ctx.save(); ctx.globalAlpha=0.20; ctx.strokeStyle='#1565c0'; ctx.lineWidth=1.5;
  ctx.strokeRect(x+w*0.04,y+h*0.05,w*0.92,h*0.90);
  ctx.restore();
  // Blue line (ringette free-play zone)
  ctx.save(); ctx.globalAlpha=0.40; ctx.strokeStyle='#1e88e5'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x+w*0.04,y+h/2); ctx.lineTo(x+w*0.96,y+h/2); ctx.stroke();
  ctx.restore();
  // Goal crease circles
  ctx.save(); ctx.globalAlpha=0.22; ctx.strokeStyle='#e53935'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(x+w/2,y+h*0.12,Math.min(w,h)*0.10,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+w/2,y+h*0.88,Math.min(w,h)*0.10,0,Math.PI*2); ctx.stroke();
  ctx.restore();
  // Blue ringette ring — donut. Anchor to the sport shape's centre so the
  // ring sits precisely behind the white shape (independent of the rink
  // markings above, which stay at their rink positions).
  const _rgFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const cx = x + w * 0.5;
  const cy = _rgFo?.shapeCy ?? (y + h * 0.5);
  const oR=Math.min(w,h)*0.38, iR=Math.min(w,h)*0.21;
  ctx.fillStyle='#3a78c9';
  ctx.beginPath(); ctx.arc(cx,cy,oR,0,Math.PI*2); ctx.fill();
  const bg2=ctx.createLinearGradient(cx-oR,cy-oR,cx+oR,cy+oR);
  bg2.addColorStop(0,'#e3f2fd'); bg2.addColorStop(1,'#eef7ff');
  ctx.fillStyle=bg2;
  ctx.beginPath(); ctx.arc(cx,cy,iR,0,Math.PI*2); ctx.fill();
  // Ring tread
  ctx.save(); ctx.globalAlpha=0.25; ctx.strokeStyle='#1a3a6a'; ctx.lineWidth=1.5;
  for(let i=0;i<6;i++){const a=i*Math.PI/3,ra=(oR+iR)/2;ctx.beginPath();ctx.arc(cx,cy,ra,a,a+Math.PI/3.5);ctx.stroke();}
  ctx.restore();
  // Gloss
  ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(cx,cy,oR,Math.PI*1.15,Math.PI*1.75); ctx.stroke();
  const sheen=ctx.createRadialGradient(cx-oR*0.3,cy-oR*0.3,2,cx,cy,oR);
  sheen.addColorStop(0,'rgba(255,255,255,0.22)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillRingetteLeft=fillRingette, fillRingetteRight=fillRingette;

// ── CURLING ROCK ── with curling sheet (house, hog lines)
function fillCurling(ctx, x, y, w, h) {
  // Ice sheet base
  const gi=ctx.createLinearGradient(x,y,x,y+h);
  gi.addColorStop(0,'#e8f4fd'); gi.addColorStop(0.5,'#f0f8ff'); gi.addColorStop(1,'#ddeefa');
  ctx.fillStyle=gi; ctx.fillRect(x,y,w,h);
  // Fine pebbled ice texture
  ctx.save(); ctx.globalAlpha=0.07;
  for(let i=0;i<80;i++){
    const px=x+((i*137+31)%(w-2))+1, py2=y+((i*113+47)%(h-2))+1;
    ctx.fillStyle='#80b0d0'; ctx.beginPath(); ctx.arc(px,py2,0.7,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  // Centre line (red)
  ctx.save(); ctx.globalAlpha=0.30; ctx.strokeStyle='#d32f2f'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.05); ctx.lineTo(x+w/2,y+h*0.95); ctx.stroke();
  ctx.restore();
  // Hog lines (blue)
  ctx.save(); ctx.globalAlpha=0.28; ctx.strokeStyle='#1565c0'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x+w*0.04,y+h*0.25); ctx.lineTo(x+w*0.96,y+h*0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.04,y+h*0.75); ctx.lineTo(x+w*0.96,y+h*0.75); ctx.stroke();
  ctx.restore();
  // The house (target circles) centred
  const hcx=x+w/2, hcy=y+h/2;
  const hRmax=Math.min(w,h)*0.32;
  [['#d32f2f',1.0],['#ffffff',0.72],['#1565c0',0.48],['#ffffff',0.24]].forEach(([col,rf])=>{
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(hcx,hcy,hRmax*rf,0,Math.PI*2); ctx.fill();
  });
  ctx.strokeStyle='rgba(0,0,0,0.10)'; ctx.lineWidth=0.5;
  [1.0,0.72,0.48,0.24].forEach(rf=>{ctx.beginPath();ctx.arc(hcx,hcy,hRmax*rf,0,Math.PI*2);ctx.stroke();});
  // Rock (granite) on top
  const gRock=ctx.createRadialGradient(hcx-10,hcy-10,4,hcx,hcy,Math.min(w,h)*0.20);
  gRock.addColorStop(0,'#607d8b'); gRock.addColorStop(0.5,'#455a64'); gRock.addColorStop(1,'#37474f');
  ctx.fillStyle=gRock;
  ctx.beginPath(); ctx.arc(hcx,hcy,Math.min(w,h)*0.18,0,Math.PI*2); ctx.fill();
  // Granite speckle
  ctx.save(); ctx.globalAlpha=0.22;
  for(let i=0;i<60;i++){
    const px=hcx-Math.min(w,h)*0.18+((i*137)%(Math.min(w,h)*0.36));
    const py3=hcy-Math.min(w,h)*0.18+((i*113)%(Math.min(w,h)*0.36));
    ctx.fillStyle=i%2?'#90a4ae':'#cfd8dc';
    ctx.beginPath(); ctx.arc(px,py3,0.6,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  // Handle (red/yellow)
  ctx.fillStyle='#ef5350';
  ctx.beginPath(); ctx.arc(hcx,hcy,Math.min(w,h)*0.065,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,220,0,0.9)';
  ctx.beginPath(); ctx.arc(hcx,hcy,Math.min(w,h)*0.03,0,Math.PI*2); ctx.fill();
  // Sheen
  const sheen=ctx.createRadialGradient(hcx-12,hcy-12,3,hcx,hcy,Math.min(w,h)*0.18);
  sheen.addColorStop(0,'rgba(255,255,255,0.22)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillCurlingLeft=fillCurling, fillCurlingRight=fillCurling;

// ── GYMNASTICS ── with prominent sparkles
function fillGymnastics(ctx, x, y, w, h) {
  // Blue competition mat base
  const g=ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0,'#1565c0'); g.addColorStop(0.5,'#1976d2'); g.addColorStop(1,'#0d47a1');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Mat boundary lines
  ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1.5;
  ctx.strokeRect(x+8,y+8,w-16,h-16);
  ctx.strokeRect(x+16,y+16,w-32,h-32);
  ctx.restore();
  // Wood floor edge strips at top and bottom
  ctx.save();
  const stripH=h*0.06;
  const stripG=ctx.createLinearGradient(x,y,x,y+stripH);
  stripG.addColorStop(0,'#d2b48c'); stripG.addColorStop(1,'#b8956a');
  ctx.fillStyle=stripG; ctx.globalAlpha=0.35;
  ctx.fillRect(x,y,w,stripH);
  ctx.fillRect(x,y+h-stripH,w,stripH);
  ctx.restore();
  // Rhythmic ribbon accent — flowing curve
  ctx.save(); ctx.globalAlpha=0.30;
  const rColors=['#e91e63','#9c27b0','#00bcd4'];
  rColors.forEach((col,ri)=>{
    ctx.strokeStyle=col; ctx.lineWidth=Math.max(2,Math.min(w,h)*0.012); ctx.lineCap='round';
    const offY=h*(0.30+ri*0.18);
    ctx.beginPath(); ctx.moveTo(x,y+offY);
    for(let t=0;t<=1;t+=0.02){
      const px3=x+w*t;
      const py3=y+offY+Math.sin(t*Math.PI*4+ri*1.5)*h*0.08;
      ctx.lineTo(px3,py3);
    }
    ctx.stroke();
  });
  ctx.restore();
  // Faint equipment silhouettes
  ctx.save(); ctx.globalAlpha=0.08; ctx.fillStyle='#fff';
  // Rings silhouette
  const rR=Math.min(w,h)*0.06;
  ctx.lineWidth=rR*0.35; ctx.strokeStyle='rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(x+w*0.20,y+h*0.45,rR,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+w*0.30,y+h*0.45,rR,0,Math.PI*2); ctx.stroke();
  // Balance beam silhouette
  ctx.fillRect(x+w*0.55,y+h*0.50,w*0.35,Math.max(3,h*0.012));
  ctx.restore();
}
const fillGymnasticsLeft=fillGymnastics, fillGymnasticsRight=fillGymnastics;

// Helpers
function drawPentagon(ctx,cx,cy,r){
  ctx.beginPath();
  for(let i=0;i<5;i++){const a=(i*2*Math.PI/5)-Math.PI/2;ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
  ctx.closePath(); ctx.fill();
}
function drawHexPatch(ctx,cx,cy,r){
  ctx.beginPath();
  for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
  ctx.closePath(); ctx.fill();
}
function drawStar(ctx,cx,cy,pts,outerR,innerR){
  ctx.beginPath();
  for(let i=0;i<pts*2;i++){const a=(i*Math.PI)/pts-Math.PI/2,r=i%2===0?outerR:innerR;ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
  ctx.closePath(); ctx.fill();
}

// ── GOLF ─────────────────────────────────────────────────────────────────────
function drawGolfBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0,'#2e7d32'],[0.55,'#388e3c'],[1,'#1b5e20']]);
  ctx.save(); ctx.globalAlpha=0.07;
  for(let i=0;i<14;i++){ctx.fillStyle=i%2===0?'#000':'#fff';ctx.fillRect(i*(W/14),0,W/14,H);}
  ctx.restore();
  // Fairway ellipse
  ctx.save(); ctx.globalAlpha=0.28; ctx.fillStyle='#43a047';
  ctx.beginPath(); ctx.ellipse(W/2,H*0.72,W*0.38,H*0.18,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
  // Bunker
  ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='#f5f0dc';
  ctx.beginPath(); ctx.ellipse(W*0.78,H*0.65,W*0.14,H*0.08,0.3,0,Math.PI*2); ctx.fill();
  ctx.restore();
  // Hole cup only — no flag pole in background
  ctx.fillStyle='#1b5e20';
  ctx.beginPath(); ctx.ellipse(W*0.5,H*0.725,W*0.025,W*0.009,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.ellipse(W*0.5,H*0.725,W*0.025,W*0.009,0,0,Math.PI*2); ctx.stroke();
}

// Left ticket (top ticket in portrait / left in landscape): flags + fairway
function fillGolfLeft(ctx, x, y, w, h) {
  // Well-mowed fairway — alternating stripe pairs
  const stripe=w/10;
  for(let i=0;i<10;i++){
    const c=i%2===0?'#3a8c35':'#4caf50';
    ctx.fillStyle=c; ctx.fillRect(x+i*stripe,y,stripe,h);
  }
  // Cross-mow subtle diagonal shimmer
  ctx.save(); ctx.globalAlpha=0.07;
  for(let i=0;i<8;i++){
    ctx.fillStyle=i%2?'rgba(0,60,0,0.4)':'rgba(100,200,60,0.3)';
    ctx.fillRect(x,y+i*(h/8),w,h/8);
  }
  ctx.restore();
  // Fairway border (collar/fringe)
  ctx.save(); ctx.globalAlpha=0.15; ctx.strokeStyle='#1b5e20'; ctx.lineWidth=2;
  ctx.strokeRect(x+w*0.04,y+h*0.04,w*0.92,h*0.92);
  ctx.restore();
  function drawCornerFlag(cx2, cy2, poleDir, flagDir) {
    const poleLen = Math.min(w, h) * 0.10;
    const fW = poleLen * 0.65, fH = poleLen * 0.45;
    ctx.save();
    ctx.strokeStyle='rgba(80,60,40,0.75)'; ctx.lineWidth=1.2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(cx2, cy2 + poleDir*poleLen); ctx.stroke();
    ctx.fillStyle='#e53935';
    ctx.beginPath();
    ctx.moveTo(cx2, cy2);
    ctx.lineTo(cx2 + flagDir*fW, cy2 + poleDir*fH*0.5);
    ctx.lineTo(cx2, cy2 + poleDir*fH);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const pad = Math.min(w,h)*0.07;
  drawCornerFlag(x+pad, y+pad, 1, 1);
  drawCornerFlag(x+w-pad, y+pad, 1, -1);
}
// Right ticket: fairway without flags
function fillGolfRight(ctx, x, y, w, h) {
  const stripe=w/10;
  for(let i=0;i<10;i++){
    const c=i%2===0?'#3a8c35':'#4caf50';
    ctx.fillStyle=c; ctx.fillRect(x+i*stripe,y,stripe,h);
  }
  ctx.save(); ctx.globalAlpha=0.07;
  for(let i=0;i<8;i++){
    ctx.fillStyle=i%2?'rgba(0,60,0,0.4)':'rgba(100,200,60,0.3)';
    ctx.fillRect(x,y+i*(h/8),w,h/8);
  }
  ctx.restore();
  ctx.save(); ctx.globalAlpha=0.15; ctx.strokeStyle='#1b5e20'; ctx.lineWidth=2;
  ctx.strokeRect(x+w*0.04,y+h*0.04,w*0.92,h*0.92);
  ctx.restore();
}

// ── FIGURE SKATING BG ────────────────────────────────────────────────────────
function drawFigureSkatingBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0,'#e3f2fd'],[0.5,'#bbdefb'],[1,'#90caf9']]);
  ctx.save(); ctx.globalAlpha=0.18; ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5;
  for(let yl=H*0.3;yl<H;yl+=22){ctx.beginPath();ctx.moveTo(0,yl);ctx.lineTo(W,yl+8);ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle='rgba(25,118,210,0.55)'; ctx.lineWidth=3;
  ctx.beginPath(); roundRect(ctx,W*0.04,H*0.06,W*0.92,H*0.88,18); ctx.stroke();
  ctx.save(); ctx.globalAlpha=0.22; ctx.strokeStyle='#1565c0'; ctx.lineWidth=1.5;
  function dashedEllipse2(ecx,ecy,rx2,ry2,segs){
    for(let i=0;i<segs;i+=2){
      const a1=i*(2*Math.PI/segs), a2=(i+1)*(2*Math.PI/segs);
      ctx.beginPath();
      for(let s=0;s<=8;s++){const a=a1+(a2-a1)*(s/8);if(s===0)ctx.moveTo(ecx+Math.cos(a)*rx2,ecy+Math.sin(a)*ry2);else ctx.lineTo(ecx+Math.cos(a)*rx2,ecy+Math.sin(a)*ry2);}
      ctx.stroke();
    }
  }
  dashedEllipse2(W*0.35,H*0.48,W*0.22,H*0.2,16);
  dashedEllipse2(W*0.65,H*0.52,W*0.22,H*0.2,16);
  ctx.restore();
  ctx.strokeStyle='rgba(211,47,47,0.6)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(W*0.04,H/2); ctx.lineTo(W*0.96,H/2); ctx.stroke();
  ctx.strokeStyle='rgba(21,101,192,0.5)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(W*0.04,H*0.33); ctx.lineTo(W*0.96,H*0.33); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.04,H*0.67); ctx.lineTo(W*0.96,H*0.67); ctx.stroke();
}
// ── FIGURE SKATING ── well-skated-on ice surface
function fillFigureSkating(ctx, x, y, w, h) {
  // Ice base — slightly warmer white suggesting old ice
  const g=ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0,'#e8f4fd'); g.addColorStop(1,'#c8dff0');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Heavy overlapping skate scratch marks — curved arcs in all directions
  ctx.save(); ctx.globalAlpha=0.12; ctx.strokeStyle='#78b0d0'; ctx.lineWidth=0.7; ctx.lineCap='round';
  const scratchPts=[
    [0.1,0.2,0.9,0.4],[0.8,0.1,0.2,0.5],[0.3,0.7,0.7,0.3],[0.5,0.1,0.3,0.8],
    [0.0,0.5,1.0,0.45],[0.6,0.9,0.4,0.1],[0.15,0.55,0.85,0.5],[0.7,0.65,0.2,0.3],
    [0.4,0.0,0.6,1.0],[0.2,0.8,0.8,0.2],[0.05,0.3,0.95,0.7],[0.9,0.8,0.1,0.6],
    [0.0,0.15,0.55,0.85],[0.45,0.05,0.85,0.75],[0.25,0.95,0.75,0.05],[0.60,0.35,0.10,0.65],
    [0.75,0.0,0.15,0.60],[0.30,0.1,0.80,0.55],[0.50,0.85,0.95,0.15],[0.05,0.70,0.60,0.10],
    [0.88,0.45,0.12,0.55],[0.40,0.60,0.90,0.20],[0.20,0.40,0.70,0.90],[0.55,0.15,0.05,0.85],
    [0.70,0.85,0.25,0.15],[0.15,0.80,0.85,0.25],[0.50,0.50,0.95,0.05],[0.35,0.30,0.65,0.80],
    [0.80,0.60,0.20,0.40],[0.10,0.40,0.90,0.60],[0.60,0.70,0.30,0.10],[0.45,0.90,0.55,0.05],
  ];
  scratchPts.forEach(([x1r,y1r,x2r,y2r])=>{
    const sx=x+w*x1r,sy=y+h*y1r,ex=x+w*x2r,ey=y+h*y2r;
    const mx=(sx+ex)/2+((sx-ex)*0.18),my=(sy+ey)/2+((ey-sy)*0.25);
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
  });
  // Additional fine scratches (shorter, denser)
  ctx.globalAlpha=0.09; ctx.lineWidth=0.5;
  for(let i=0;i<28;i++){
    const ax=(i*97+31)%100/100, ay=(i*113+17)%100/100;
    const bx=((i*83+55)%100/100), by=((i*61+29)%100/100);
    const sx2=x+w*ax, sy2=y+h*ay, ex2=x+w*bx, ey2=y+h*by;
    const mx2=(sx2+ex2)/2+(sy2-ey2)*0.15, my2=(sy2+ey2)/2+(sx2-ex2)*0.15;
    ctx.beginPath(); ctx.moveTo(sx2,sy2); ctx.quadraticCurveTo(mx2,my2,ex2,ey2); ctx.stroke();
  }
  // Figure-8 loops (ruts worn into ice)
  ctx.globalAlpha=0.18; ctx.strokeStyle='#5090b8'; ctx.lineWidth=1.2;
  for(let loop=0;loop<3;loop++){
    const lcx=x+w*(0.25+loop*0.25), lcy=y+h*(0.45+loop*0.05), lr=Math.min(w,h)*0.14;
    ctx.beginPath(); ctx.ellipse(lcx,lcy,lr,lr*0.60,0.2*loop,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
  // Ice gouges (deeper ruts — thicker lines)
  ctx.save(); ctx.globalAlpha=0.11; ctx.strokeStyle='#4a80a0'; ctx.lineWidth=1.8; ctx.lineCap='round';
  [[0.2,0.35,0.7,0.6],[0.8,0.25,0.3,0.75],[0.1,0.65,0.9,0.35],[0.55,0.1,0.45,0.9],[0.0,0.8,0.8,0.0]].forEach(([x1r,y1r,x2r,y2r])=>{
    const sx=x+w*x1r,sy=y+h*y1r,ex=x+w*x2r,ey=y+h*y2r;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.bezierCurveTo(sx+20,sy-15,ex-20,ey+15,ex,ey); ctx.stroke();
  });
  ctx.restore();
  // Figure skater silhouette (centred, drawn in profile — forward glide, arabesque arms)
  {
    const sx = x+w*0.5, sy = y+h*0.50;
    const sc3 = Math.min(w,h) * 0.032;
    ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle='#1a5a8a'; ctx.lineWidth=sc3*0.55; ctx.lineCap='round'; ctx.lineJoin='round';
    // Head
    ctx.fillStyle='#1a5a8a';
    ctx.beginPath(); ctx.arc(sx, sy - sc3*5.5, sc3*0.9, 0, Math.PI*2); ctx.fill();
    // Body — leaning forward
    ctx.beginPath();
    ctx.moveTo(sx, sy - sc3*4.6);                    // neck
    ctx.bezierCurveTo(sx+sc3*0.3, sy-sc3*3.8,        // upper back
                      sx+sc3*0.5, sy-sc3*2.6,        // mid back
                      sx+sc3*0.2, sy-sc3*1.4);       // hips
    ctx.stroke();
    // Support leg (straight down)
    ctx.beginPath();
    ctx.moveTo(sx+sc3*0.2, sy-sc3*1.4);
    ctx.lineTo(sx+sc3*0.3, sy+sc3*1.2);              // knee
    ctx.lineTo(sx+sc3*0.2, sy+sc3*2.8);              // ankle
    ctx.stroke();
    // Blade on support foot
    ctx.lineWidth = sc3*0.9;
    ctx.beginPath(); ctx.moveTo(sx-sc3*0.4, sy+sc3*2.9); ctx.lineTo(sx+sc3*0.9, sy+sc3*2.9); ctx.stroke();
    ctx.lineWidth = sc3*0.55;
    // Free leg — extended back and up (arabesque)
    ctx.beginPath();
    ctx.moveTo(sx+sc3*0.2, sy-sc3*1.4);              // hip
    ctx.bezierCurveTo(sx-sc3*0.6, sy-sc3*0.4,
                      sx-sc3*1.4, sy-sc3*0.0,
                      sx-sc3*2.2, sy-sc3*0.8);       // foot lifted
    ctx.stroke();
    // Leading arm — stretched forward and up
    ctx.beginPath();
    ctx.moveTo(sx+sc3*0.3, sy-sc3*3.8);              // shoulder
    ctx.bezierCurveTo(sx+sc3*1.2, sy-sc3*4.2,
                      sx+sc3*2.0, sy-sc3*3.8,
                      sx+sc3*2.6, sy-sc3*3.5);       // fingertips
    ctx.stroke();
    // Trailing arm — swept back
    ctx.beginPath();
    ctx.moveTo(sx+sc3*0.3, sy-sc3*3.8);              // shoulder
    ctx.bezierCurveTo(sx-sc3*0.5, sy-sc3*3.5,
                      sx-sc3*1.2, sy-sc3*3.0,
                      sx-sc3*1.8, sy-sc3*2.8);       // fingertips back
    ctx.stroke();
    ctx.restore();
  }
}
const fillFigureSkatingLeft=fillFigureSkating, fillFigureSkatingRight=fillFigureSkating;

// ── LACROSSE ──────────────────────────────────────────────────────────────────
function drawLacrosseBg(ctx, W, H) {
  gfx.linearFill(ctx, W, H, [[0,'#1b5e20'],[0.5,'#2e7d32'],[1,'#1b5e20']]);
  ctx.save(); ctx.globalAlpha=0.08;
  for(let i=0;i<12;i++){ctx.fillStyle=i%2?'#000':'#fff';ctx.fillRect(i*(W/12),0,W/12,H);}
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=2.5;
  ctx.strokeRect(W*0.04,H*0.06,W*0.92,H*0.88);
  ctx.beginPath(); ctx.moveTo(W/2,H*0.06); ctx.lineTo(W/2,H*0.94); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(W*0.15,H/2,H*0.18,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W*0.85,H/2,H*0.18,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2,H/2,H*0.12,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.04,H*0.42,W*0.05,H*0.16);
  ctx.strokeRect(W*0.91,H*0.42,W*0.05,H*0.16);
}
function fillLacrosse(ctx, x, y, w, h) {
  // Green field surface with mowed stripes
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#2e7d32'); gf.addColorStop(0.5,'#388e3c'); gf.addColorStop(1,'#2e7d32');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  // Mowed stripes
  ctx.save(); ctx.globalAlpha=0.09;
  for(let i=0;i<10;i++){ctx.fillStyle=i%2?'rgba(0,50,0,0.4)':'rgba(100,210,60,0.25)';ctx.fillRect(x+i*(w/10),y,w/10,h);}
  ctx.restore();
  // === LACROSSE FIELD LINES ===
  ctx.save(); ctx.lineCap='round';
  // Outer boundary
  ctx.globalAlpha=0.35; ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=1.5;
  ctx.strokeRect(x+w*0.04,y+h*0.04,w*0.92,h*0.92);
  // Centre line (along width)
  ctx.globalAlpha=0.30; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(x+w*0.04,y+h*0.5); ctx.lineTo(x+w*0.96,y+h*0.5); ctx.stroke();
  // Centre circle
  ctx.globalAlpha=0.25; ctx.lineWidth=1.0;
  ctx.beginPath(); ctx.arc(x+w/2,y+h/2,Math.min(w,h)*0.12,0,Math.PI*2); ctx.stroke();
  // Crease circles (at each goal — in box style)
  const creaseR = Math.min(w,h)*0.18;
  ctx.globalAlpha=0.25; ctx.lineWidth=1.0;
  ctx.beginPath(); ctx.arc(x+w*0.14,y+h/2,creaseR,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x+w*0.86,y+h/2,creaseR,0,Math.PI*2); ctx.stroke();
  // Goal boxes (small rectangles at each end)
  ctx.globalAlpha=0.30; ctx.lineWidth=1.2;
  ctx.strokeRect(x+w*0.04,y+h*0.42,w*0.05,h*0.16);
  ctx.strokeRect(x+w*0.91,y+h*0.42,w*0.05,h*0.16);
  // 30-yard lines (restraining lines)
  ctx.globalAlpha=0.22; ctx.lineWidth=1.0; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(x+w*0.30,y+h*0.04); ctx.lineTo(x+w*0.30,y+h*0.96); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.70,y+h*0.04); ctx.lineTo(x+w*0.70,y+h*0.96); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // Lacrosse stick + ball centred
  const hx=x+w*0.5, hy=y+h*0.5, hr=Math.min(w,h)*0.22;
  ctx.strokeStyle='#8d6e63'; ctx.lineWidth=Math.max(2,hr*0.12); ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(hx, hy-hr*1.1);
  ctx.bezierCurveTo(hx+hr*0.85,hy-hr*1.0, hx+hr*0.85,hy+hr*0.6, hx,hy+hr*0.8);
  ctx.bezierCurveTo(hx-hr*0.85,hy+hr*0.6, hx-hr*0.85,hy-hr*1.0, hx,hy-hr*1.1);
  ctx.stroke();
  ctx.strokeStyle='rgba(180,140,100,0.50)'; ctx.lineWidth=1.2;
  for(let i=1;i<5;i++){
    const sy=hy-hr*0.9+i*(hr*1.7/5);
    const spread=hr*0.7*(1-Math.abs(i-2.5)/3.5);
    ctx.beginPath(); ctx.moveTo(hx-spread,sy); ctx.lineTo(hx+spread,sy); ctx.stroke();
  }
  for(let j=-1;j<=1;j++){
    ctx.beginPath(); ctx.moveTo(hx+j*hr*0.35,hy-hr*0.9); ctx.lineTo(hx+j*hr*0.35,hy+hr*0.75); ctx.stroke();
  }
  ctx.strokeStyle='#7d5a4a'; ctx.lineWidth=Math.max(3,hr*0.18); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(hx,hy+hr*0.8); ctx.lineTo(hx,hy+hr*1.5); ctx.stroke();
}
const fillLacrosseLeft=fillLacrosse, fillLacrosseRight=fillLacrosse;

// ── RUGBY ─────────────────────────────────────────────────────────────────────
function drawRugbyBg(ctx, W, H) {
  // Green pitch with stripes
  gfx.linearFill(ctx, W, H, [[0,'#1b5e20'],[0.5,'#2e7d32'],[1,'#1b5e20']]);
  ctx.save(); ctx.globalAlpha=0.07;
  for(let i=0;i<12;i++){ctx.fillStyle=i%2?'#000':'#fff';ctx.fillRect(i*(W/12),0,W/12,H);}
  ctx.restore();
  // Field markings
  ctx.strokeStyle='rgba(255,255,255,0.80)'; ctx.lineWidth=2.5;
  ctx.strokeRect(W*0.04,H*0.06,W*0.92,H*0.88);
  // Try lines (22m equivalents)
  ctx.beginPath(); ctx.moveTo(W*0.2,H*0.06); ctx.lineTo(W*0.2,H*0.94); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.8,H*0.06); ctx.lineTo(W*0.8,H*0.94); ctx.stroke();
  // Halfway line
  ctx.lineWidth=3; ctx.strokeStyle='rgba(255,255,255,0.90)';
  ctx.beginPath(); ctx.moveTo(W/2,H*0.06); ctx.lineTo(W/2,H*0.94); ctx.stroke();
  // In-goal areas (shaded)
  ctx.save(); ctx.globalAlpha=0.12; ctx.fillStyle='#ffffff';
  ctx.fillRect(W*0.04,H*0.06,W*0.16,H*0.88);
  ctx.fillRect(W*0.80,H*0.06,W*0.16,H*0.88);
  ctx.restore();
  // H-shaped goal posts
  function drawPosts(cx) {
    ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(cx,H*0.06); ctx.lineTo(cx,H*0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-W*0.07,H*0.25); ctx.lineTo(cx+W*0.07,H*0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-W*0.07,H*0.25); ctx.lineTo(cx-W*0.07,H*0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+W*0.07,H*0.25); ctx.lineTo(cx+W*0.07,H*0.06); ctx.stroke();
  }
  drawPosts(W*0.04+W*0.04); drawPosts(W*0.96-W*0.04);
}
function fillRugby(ctx, x, y, w, h) {
  // Green pitch surface
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#4a7c30'); gf.addColorStop(0.5,'#5a8f3c'); gf.addColorStop(1,'#426e2a');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  // Mowed stripes
  ctx.save(); ctx.globalAlpha=0.07;
  for(let i=0;i<10;i++){ctx.fillStyle=i%2?'rgba(0,40,0,0.4)':'rgba(100,200,60,0.2)';ctx.fillRect(x+i*(w/10),y,w/10,h);}
  ctx.restore();
  // Field markers — try lines, halfway, in-goal shading
  ctx.save(); ctx.globalAlpha=0.28; ctx.strokeStyle='rgba(255,255,255,0.80)'; ctx.lineWidth=1.5;
  ctx.strokeRect(x+w*0.04,y+h*0.05,w*0.92,h*0.90);
  // Try lines (~22m marks)
  ctx.beginPath(); ctx.moveTo(x+w*0.22,y+h*0.05); ctx.lineTo(x+w*0.22,y+h*0.95); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.78,y+h*0.05); ctx.lineTo(x+w*0.78,y+h*0.95); ctx.stroke();
  // Halfway
  ctx.lineWidth=2; ctx.strokeStyle='rgba(255,255,255,0.90)';
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.05); ctx.lineTo(x+w/2,y+h*0.95); ctx.stroke();
  // In-goal tint
  ctx.fillStyle='rgba(255,255,255,0.06)';
  ctx.fillRect(x+w*0.04,y+h*0.05,w*0.18,h*0.90);
  ctx.fillRect(x+w*0.78,y+h*0.05,w*0.18,h*0.90);
  ctx.restore();
  // Rugby ball centred
  const bx=x+w/2, by=y+h/2, brx=Math.min(w,h)*0.28, bry=Math.min(w,h)*0.17;
  const bg2=ctx.createRadialGradient(bx-brx*0.3,by-bry*0.4,brx*0.1,bx,by,brx);
  bg2.addColorStop(0,'#a0522d'); bg2.addColorStop(1,'#6b2d0a');
  ctx.fillStyle=bg2;
  ctx.beginPath(); ctx.ellipse(bx,by,brx,bry,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#5C2D0A'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.ellipse(bx,by,brx,bry,0,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(60,20,0,0.45)'; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(bx-brx,by); ctx.quadraticCurveTo(bx,by-bry*0.7,bx+brx,by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx-brx,by); ctx.quadraticCurveTo(bx,by+bry*0.7,bx+brx,by); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(bx,by-bry*0.7); ctx.lineTo(bx,by+bry*0.7); ctx.stroke();
  ctx.lineWidth=1;
  [-0.35,0,0.35].forEach(t=>{const ly2=by+t*bry*1.1;ctx.beginPath();ctx.moveTo(bx-brx*0.22,ly2);ctx.lineTo(bx+brx*0.22,ly2);ctx.stroke();});
}
const fillRugbyLeft=fillRugby, fillRugbyRight=fillRugby;

// ── TENNIS ───────────────────────────────────────────────────────────────────
function drawTennisBg(ctx, W, H) {
  // Terracotta clay court — full canvas
  gfx.linearFill(ctx, W, H, [[0,'#c1440e'],[0.5,'#d4520f'],[1,'#b03a0a']]);
  // Subtle horizontal grain texture across entire court
  ctx.save(); ctx.globalAlpha=0.04;
  for(let i=0;i<H;i+=3){ctx.fillStyle=i%6?'#000':'#fff';ctx.fillRect(0,i,W,1.5);}
  ctx.restore();
  // Full-canvas court lines (visible everywhere including outside ticket shapes)
  const lw=2.2;
  ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=lw;
  // Outer boundary — edge-to-edge
  ctx.strokeRect(W*0.02,H*0.03,W*0.96,H*0.94);
  // Baselines extended
  ctx.beginPath(); ctx.moveTo(W*0.02,H*0.25); ctx.lineTo(W*0.98,H*0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.02,H*0.75); ctx.lineTo(W*0.98,H*0.75); ctx.stroke();
  // Singles sidelines
  ctx.beginPath(); ctx.moveTo(W*0.12,H*0.03); ctx.lineTo(W*0.12,H*0.97); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.88,H*0.03); ctx.lineTo(W*0.88,H*0.97); ctx.stroke();
  // Service boxes
  ctx.beginPath(); ctx.moveTo(W*0.12,H*0.03+H*0.4); ctx.lineTo(W*0.88,H*0.03+H*0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.12,H*0.97-H*0.4); ctx.lineTo(W*0.88,H*0.97-H*0.4); ctx.stroke();
  // Centre service line
  ctx.beginPath(); ctx.moveTo(W/2,H*0.03+H*0.4); ctx.lineTo(W/2,H*0.97-H*0.4); ctx.stroke();
  // Net — thicker, full width
  ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(W*0.02,H/2); ctx.lineTo(W*0.98,H/2); ctx.stroke();
  // Net posts
  ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(W*0.02,H*0.33); ctx.lineTo(W*0.02,H*0.67); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.98,H*0.33); ctx.lineTo(W*0.98,H*0.67); ctx.stroke();
  // Net mesh
  ctx.strokeStyle='rgba(255,255,255,0.22)'; ctx.lineWidth=0.8;
  for(let nx=W*0.02;nx<W*0.98;nx+=W*0.055){
    ctx.beginPath(); ctx.moveTo(nx,H*0.33); ctx.lineTo(nx,H*0.67); ctx.stroke();
  }
}
function fillTennis(ctx, x, y, w, h) {
  // Hard court blue — distinctive from the terracotta background
  ctx.fillStyle='#2a5298'; ctx.fillRect(x,y,w,h);
  // Court surface texture
  ctx.save(); ctx.globalAlpha=0.06; ctx.strokeStyle='#1a3570'; ctx.lineWidth=0.8;
  for(let i=0;i<10;i++){ctx.beginPath();ctx.moveTo(x+i*(w/10),y);ctx.lineTo(x+i*(w/10),y+h);ctx.stroke();}
  ctx.restore();
  // White court lines inside ticket shape
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,0.82)'; ctx.lineWidth=Math.max(1, w*0.012);
  // Outer boundary (inside the ticket shape margins)
  const m=w*0.06;
  ctx.strokeRect(x+m, y+m, w-m*2, h-m*2);
  // Service line (horizontal, top half)
  ctx.beginPath(); ctx.moveTo(x+m, y+h*0.38); ctx.lineTo(x+w-m, y+h*0.38); ctx.stroke();
  // Service line (horizontal, bottom half)
  ctx.beginPath(); ctx.moveTo(x+m, y+h*0.62); ctx.lineTo(x+w-m, y+h*0.62); ctx.stroke();
  // Centre service line (vertical)
  ctx.beginPath(); ctx.moveTo(x+w/2, y+h*0.38); ctx.lineTo(x+w/2, y+h*0.62); ctx.stroke();
  // Singles sidelines (inset from outer)
  const si=w*0.14;
  ctx.beginPath(); ctx.moveTo(x+si, y+m); ctx.lineTo(x+si, y+h-m); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w-si, y+m); ctx.lineTo(x+w-si, y+h-m); ctx.stroke();
  // Net — thicker centred line
  ctx.lineWidth=Math.max(2, w*0.022); ctx.strokeStyle='rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.moveTo(x+m, y+h/2); ctx.lineTo(x+w-m, y+h/2); ctx.stroke();
  ctx.restore();
  // Tennis ball
  const bx=x+w/2, by=y+h/2, br=Math.min(w,h)*0.14;
  const bg2=ctx.createRadialGradient(bx-br*0.3,by-br*0.3,br*0.1,bx,by,br);
  bg2.addColorStop(0,'#e0ee00'); bg2.addColorStop(1,'#b8c800');
  ctx.fillStyle=bg2;
  ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#9aaa00'; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=1.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(bx-br*0.55,by-br*0.7); ctx.quadraticCurveTo(bx-br*1.0,by,bx-br*0.55,by+br*0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx+br*0.55,by-br*0.7); ctx.quadraticCurveTo(bx+br*1.0,by,bx+br*0.55,by+br*0.7); ctx.stroke();
}
const fillTennisLeft=fillTennis, fillTennisRight=fillTennis;
// ── CURLING SHEET variant — shows the full curling sheet as the ticket fill ──
function fillCurlingSheet(ctx, x, y, w, h) {
  // Ice base
  const g=ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0,'#e8f4fd'); g.addColorStop(0.5,'#ddeefa'); g.addColorStop(1,'#d0e8f6');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Pebbled ice texture
  ctx.save(); ctx.fillStyle='rgba(180,210,240,0.30)';
  for(let i=0;i<90;i++){ctx.globalAlpha=0.12+((i*7)%5)*0.03;ctx.beginPath();ctx.arc(x+((i*113+31)%Math.round(w)),y+((i*97+17)%Math.round(h)),1.2,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1; ctx.restore();
  // Centre line (red, along the length)
  ctx.save(); ctx.strokeStyle='rgba(200,20,20,0.40)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.04); ctx.lineTo(x+w/2,y+h*0.96); ctx.stroke();
  // Hog lines (blue) at 25% and 75%
  ctx.strokeStyle='rgba(20,80,200,0.35)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x+w*0.05,y+h*0.25); ctx.lineTo(x+w*0.95,y+h*0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.05,y+h*0.75); ctx.lineTo(x+w*0.95,y+h*0.75); ctx.stroke();
  // Tee line (near the house end)
  ctx.strokeStyle='rgba(200,20,20,0.30)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(x+w*0.05,y+h*0.87); ctx.lineTo(x+w*0.95,y+h*0.87); ctx.stroke();
  ctx.restore();
  // House rings around the white sport shape — a curling "house" is a
  // series of concentric coloured rings (red outer, white, blue inner,
  // white button). Rather than drawing them at a fixed position on the ice,
  // we render them as a halo around the shape so the shape becomes the
  // button and the ice sheet reads as one aligned composition.
  const _crFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const _crCx = x + w / 2;
  const _crCy = _crFo?.shapeCy ?? (y + h / 2);
  const _crSR = _crFo?.shapeR;
  if (_crSR) {
    ctx.save();
    // Red outer ring
    ctx.fillStyle = 'rgba(200,20,20,0.55)';
    ctx.beginPath(); ctx.arc(_crCx, _crCy, _crSR * 1.22, 0, Math.PI * 2); ctx.fill();
    // White band
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.beginPath(); ctx.arc(_crCx, _crCy, _crSR * 1.15, 0, Math.PI * 2); ctx.fill();
    // Blue ring
    ctx.fillStyle = 'rgba(20,80,200,0.55)';
    ctx.beginPath(); ctx.arc(_crCx, _crCy, _crSR * 1.08, 0, Math.PI * 2); ctx.fill();
    // Inner white band — sits directly against the shape's outline
    ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.beginPath(); ctx.arc(_crCx, _crCy, _crSR * 1.02, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
const fillCurlingSheetLeft=fillCurlingSheet, fillCurlingSheetRight=fillCurlingSheet;

// ── GOLF variant without corner flags ─────────────────────────────────────────
function fillGolfNoFlagsLeft(ctx,x,y,w,h){
  // Same as fillGolfLeft but without the corner flags
  const g=ctx.createLinearGradient(x,y,x,y+h);
  g.addColorStop(0,'#3a8c35'); g.addColorStop(0.5,'#4caf50'); g.addColorStop(1,'#388e3c');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Mowed stripes — alternating bands
  ctx.save(); ctx.globalAlpha=1;
  for(let i=0;i<10;i++){
    ctx.fillStyle=i%2===0?'#3a8c35':'#4caf50';
    ctx.fillRect(x+i*(w/10),y,w/10,h);
  }
  ctx.restore();
  // Cross-mow shimmer (lighter horizontal bands at low alpha)
  ctx.save(); ctx.globalAlpha=0.07; ctx.fillStyle='rgba(255,255,255,0.6)';
  for(let j=0;j<8;j++){ctx.fillRect(x,y+j*(h/8),w,h/16);}
  ctx.restore();
  // Fringe border
  ctx.save(); ctx.globalAlpha=0.15; ctx.strokeStyle='#276427'; ctx.lineWidth=Math.max(4,w*0.018);
  ctx.strokeRect(x+ctx.lineWidth/2,y+ctx.lineWidth/2,w-ctx.lineWidth,h-ctx.lineWidth);
  ctx.restore();
  // No corner flags — removed as requested
}


// ─── NEW SPORTS ───────────────────────────────────────────────────────────────

// ── ULTIMATE FRISBEE ──────────────────────────────────────────────────────────
function drawUltimateFrisbeeBg(ctx, W, H) {
  // Bright green grass field
  gfx.linearFill(ctx, W, H, [[0,'#2e7d32'],[0.5,'#388e3c'],[1,'#2e7d32']]);
  ctx.save(); ctx.globalAlpha=0.08;
  for(let i=0;i<16;i++){ctx.fillStyle=i%2?'rgba(0,40,0,0.4)':'rgba(100,200,60,0.25)';ctx.fillRect(i*(W/16),0,W/16,H);}
  ctx.restore();
  // Field boundary + end zones
  ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=2.5;
  ctx.strokeRect(W*0.04,H*0.05,W*0.92,H*0.90);
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(W*0.18,H*0.05); ctx.lineTo(W*0.18,H*0.95); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.82,H*0.05); ctx.lineTo(W*0.82,H*0.95); ctx.stroke();
  // End zone shading
  ctx.save(); ctx.globalAlpha=0.12; ctx.fillStyle='white';
  ctx.fillRect(W*0.04,H*0.05,W*0.14,H*0.90);
  ctx.fillRect(W*0.82,H*0.05,W*0.14,H*0.90);
  ctx.restore();
  // Brick mark (centre)
  ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(W/2,H*0.05); ctx.lineTo(W/2,H*0.95); ctx.stroke();
}
function fillUltimateFrisbee(ctx, x, y, w, h) {
  // Vivid green turf
  const gf=ctx.createLinearGradient(x,y,x,y+h);
  gf.addColorStop(0,'#4caf50'); gf.addColorStop(1,'#388e3c');
  ctx.fillStyle=gf; ctx.fillRect(x,y,w,h);
  ctx.save(); ctx.globalAlpha=0.08;
  for(let i=0;i<10;i++){ctx.fillStyle=i%2?'rgba(0,50,0,0.35)':'rgba(120,220,80,0.2)';ctx.fillRect(x+i*(w/10),y,w/10,h);}
  ctx.restore();
  // === ENDZONE LINES ===
  ctx.save();
  // Left endzone (distinct colour tint)
  ctx.fillStyle='rgba(0,80,0,0.18)'; ctx.fillRect(x,y,w*0.18,h);
  // Right endzone
  ctx.fillStyle='rgba(0,80,0,0.18)'; ctx.fillRect(x+w*0.82,y,w*0.18,h);
  // Endzone boundary lines (bold white)
  ctx.strokeStyle='rgba(255,255,255,0.80)'; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x+w*0.18,y+h*0.04); ctx.lineTo(x+w*0.18,y+h*0.96); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x+w*0.82,y+h*0.04); ctx.lineTo(x+w*0.82,y+h*0.96); ctx.stroke();
  // Field boundary
  ctx.strokeStyle='rgba(255,255,255,0.60)'; ctx.lineWidth=1.5;
  ctx.strokeRect(x+w*0.02,y+h*0.04,w*0.96,h*0.92);
  // Brick mark (centre of endzone)
  ctx.fillStyle='rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(x+w*0.09,y+h/2,2.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x+w*0.91,y+h/2,2.5,0,Math.PI*2); ctx.fill();
  // Centre midfield line
  ctx.strokeStyle='rgba(255,255,255,0.40)'; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(x+w/2,y+h*0.04); ctx.lineTo(x+w/2,y+h*0.96); ctx.stroke();
  ctx.restore();
  // Frisbee disc — flat and bright
  const dcx=x+w/2, dcy=y+h/2, dr=Math.min(w,h)*0.30;
  // Disc body — slight perspective tilt
  const discGrad=ctx.createLinearGradient(dcx-dr,dcy-dr*0.3,dcx+dr,dcy+dr*0.3);
  discGrad.addColorStop(0,'#ffffff'); discGrad.addColorStop(0.4,'#f0f0ff'); discGrad.addColorStop(1,'#d8d8f0');
  ctx.fillStyle=discGrad;
  ctx.beginPath(); ctx.ellipse(dcx,dcy,dr,dr*0.35,0,0,Math.PI*2); ctx.fill();
  // Rim
  ctx.strokeStyle='rgba(80,80,200,0.50)'; ctx.lineWidth=Math.max(2,dr*0.08);
  ctx.beginPath(); ctx.ellipse(dcx,dcy,dr,dr*0.35,0,0,Math.PI*2); ctx.stroke();
  // Inner dome lines
  ctx.strokeStyle='rgba(100,100,220,0.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.ellipse(dcx,dcy,dr*0.65,dr*0.22,0,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(dcx,dcy,dr*0.30,dr*0.10,0,0,Math.PI*2); ctx.stroke();
  // Sheen
  const sheen=ctx.createRadialGradient(dcx-dr*0.3,dcy-dr*0.12,2,dcx,dcy,dr*0.5);
  sheen.addColorStop(0,'rgba(255,255,255,0.65)'); sheen.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillUltimateFrisbeeLeft=fillUltimateFrisbee, fillUltimateFrisbeeRight=fillUltimateFrisbee;

// ── FENCING ───────────────────────────────────────────────────────────────────
function drawFencingBg(ctx, W, H) {
  // Classic dark wood floor / gymnasium floor
  gfx.linearFill(ctx, W, H, [[0,'#3e2723'],[0.5,'#4e342e'],[1,'#3e2723']]);
  // Wood plank lines
  ctx.save(); ctx.globalAlpha=0.10; ctx.strokeStyle='#2a1a12'; ctx.lineWidth=1;
  for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(i*(W/12),0);ctx.lineTo(i*(W/12),H);ctx.stroke();}
  ctx.restore();
  // Piste (fencing strip) — long narrow rectangle centred
  ctx.strokeStyle='rgba(255,230,100,0.85)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.05,H*0.36,W*0.90,H*0.28);
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(W/2,H*0.36); ctx.lineTo(W/2,H*0.64); ctx.stroke();
  // En-garde lines
  ctx.strokeStyle='rgba(255,200,50,0.60)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(W*0.38,H*0.36); ctx.lineTo(W*0.38,H*0.64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.62,H*0.36); ctx.lineTo(W*0.62,H*0.64); ctx.stroke();
  // Warning lines
  ctx.strokeStyle='rgba(255,120,50,0.55)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(W*0.12,H*0.36); ctx.lineTo(W*0.12,H*0.64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.88,H*0.36); ctx.lineTo(W*0.88,H*0.64); ctx.stroke();
}
function fillFencing(ctx, x, y, w, h) {
  // Dark metallic / gymnasium floor
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#1a1a2e'); g.addColorStop(0.5,'#16213e'); g.addColorStop(1,'#0f3460');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Subtle metallic sheen lines
  ctx.save(); ctx.globalAlpha=0.07; ctx.strokeStyle='#90a0c0'; ctx.lineWidth=0.8;
  for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(x,y+i*(h/12));ctx.lineTo(x+w,y+i*(h/12));ctx.stroke();}
  ctx.restore();
  // Fencing sword / épée (foil shape). Anchor to shape centre and constrain
  // total length to the shape's diameter (minus a safety margin) so the blade
  // tip and pommel can't poke out from behind the white shape at any ratio.
  const _fcFo = (typeof window !== 'undefined') ? window._sportFillOpts : null;
  const scx = x + w * 0.5;
  const scy = _fcFo?.shapeCy ?? (y + h * 0.5);
  // Prefer the shape's max radius when available; fall back to a proportional
  // length. 1.72 × shape-radius ≈ 86% of the shape's inscribed square width,
  // guaranteeing both ends stay inside the shape at any aspect ratio.
  const shapeR = _fcFo?.shapeR;
  const slen = Math.min(
    shapeR ? shapeR * 1.72 : Math.min(w, h) * 0.60,
    Math.min(w, h) * 0.60,
  );
  ctx.save(); ctx.lineCap='round';
  // Blade
  ctx.strokeStyle='rgba(200,215,240,0.80)'; ctx.lineWidth=Math.max(2,slen*0.025);
  ctx.beginPath(); ctx.moveTo(scx-slen*0.55,scy); ctx.lineTo(scx+slen*0.45,scy); ctx.stroke();
  // Guard / bell (circle near handle end)
  ctx.strokeStyle='rgba(180,190,210,0.75)'; ctx.lineWidth=Math.max(1.5,slen*0.018);
  ctx.beginPath(); ctx.arc(scx-slen*0.30,scy,slen*0.14,0,Math.PI*2); ctx.stroke();
  // Grip/handle
  ctx.strokeStyle='rgba(140,155,180,0.70)'; ctx.lineWidth=Math.max(3,slen*0.04);
  ctx.beginPath(); ctx.moveTo(scx-slen*0.55,scy); ctx.lineTo(scx-slen*0.38,scy); ctx.stroke();
  // Blade tip
  ctx.strokeStyle='rgba(220,230,255,0.90)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(scx+slen*0.43,scy); ctx.lineTo(scx+slen*0.47,scy); ctx.stroke();
  ctx.restore();
  // Electric scoring light tint
  const sheen=ctx.createRadialGradient(scx,scy,5,scx,scy,Math.min(w,h)*0.40);
  sheen.addColorStop(0,'rgba(120,180,255,0.15)'); sheen.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sheen; ctx.fillRect(x,y,w,h);
}
const fillFencingLeft=fillFencing, fillFencingRight=fillFencing;

// ── DANCE ─────────────────────────────────────────────────────────────────────
function drawDanceBg(ctx, W, H) {
  // Black-and-white checkered dance floor with perspective
  ctx.fillStyle='#0a0a14'; ctx.fillRect(0,0,W,H);
  const vx=W/2, floorTop=H*0.10, gridCols=16, rowCount=24;
  for(let row=0;row<rowCount;row++){
    const t0=row/rowCount, t1=(row+1)/rowCount;
    const y0=floorTop+(H-floorTop)*(t0*t0), y1=floorTop+(H-floorTop)*(t1*t1);
    const s0=0.2+0.8*t0, s1=0.2+0.8*t1;
    for(let col=0;col<gridCols;col++){
      const cx0=(col/gridCols-0.5)*s0, cx1=((col+1)/gridCols-0.5)*s0;
      const cx0b=(col/gridCols-0.5)*s1, cx1b=((col+1)/gridCols-0.5)*s1;
      const bri=0.45+0.55*t0;
      ctx.fillStyle=(row+col)%2===0
        ? 'rgba(8,8,18,'+bri+')'
        : 'rgba('+Math.round(180+75*bri)+','+Math.round(180+75*bri)+','+Math.min(255,Math.round(188+75*bri))+','+(0.5+0.5*bri)+')';
      ctx.beginPath(); ctx.moveTo(vx+cx0*W,y0); ctx.lineTo(vx+cx1*W,y0);
      ctx.lineTo(vx+cx1b*W,y1); ctx.lineTo(vx+cx0b*W,y1); ctx.closePath(); ctx.fill();
    }
  }
  const sh=ctx.createLinearGradient(0,H*0.3,0,H);
  sh.addColorStop(0,'rgba(255,255,255,0.04)'); sh.addColorStop(0.5,'rgba(255,255,255,0.08)');
  sh.addColorStop(1,'rgba(0,0,0,0.15)'); ctx.fillStyle=sh; ctx.fillRect(0,floorTop,W,H-floorTop);
  [0.25,0.50,0.75].forEach((fx,i)=>{
    const cols=['rgba(255,100,200,0.12)','rgba(255,230,180,0.14)','rgba(100,180,255,0.12)'];
    const slg=ctx.createRadialGradient(W*fx,H*0.15,5,W*fx,H*0.55,H*0.50);
    slg.addColorStop(0,cols[i]); slg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=slg; ctx.fillRect(0,0,W,H);
  });
  const ceil=ctx.createLinearGradient(0,0,0,H*0.18);
  ceil.addColorStop(0,'rgba(0,0,0,0.85)'); ceil.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=ceil; ctx.fillRect(0,0,W,H*0.18);
}
function fillDance(ctx, x, y, w, h) {
  // Black-and-white checkered dance floor inside ticket
  ctx.fillStyle='#0a0a14'; ctx.fillRect(x,y,w,h);
  const sq=Math.max(8,Math.round(Math.min(w,h)/10));
  for(let row=0;row<Math.ceil(h/sq)+1;row++) for(let col=0;col<Math.ceil(w/sq)+1;col++){
    ctx.fillStyle=(row+col)%2===0?'rgba(10,10,20,0.95)':'rgba(235,235,245,0.88)';
    ctx.fillRect(x+col*sq,y+row*sq,sq,sq);
  }
  const sh=ctx.createRadialGradient(x+w/2,y+h*0.4,5,x+w/2,y+h/2,Math.min(w,h)*0.55);
  sh.addColorStop(0,'rgba(255,255,255,0.10)'); sh.addColorStop(1,'rgba(0,0,0,0.15)');
  ctx.fillStyle=sh; ctx.fillRect(x,y,w,h);
  [{fx:0.3,fy:0.35,c:'rgba(255,80,180,0.12)'},{fx:0.7,fy:0.35,c:'rgba(80,160,255,0.12)'},
   {fx:0.5,fy:0.55,c:'rgba(255,220,100,0.10)'}].forEach(({fx,fy,c})=>{
    const sg=ctx.createRadialGradient(x+w*fx,y+h*fy,3,x+w*fx,y+h*fy,Math.min(w,h)*0.40);
    sg.addColorStop(0,c); sg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=sg; ctx.fillRect(x,y,w,h);
  });
  ctx.save();
  for(let i=0;i<300;i++){
    const sx=x+((i*97+11)%1000)/1000*w, sy=y+((i*113+37)%1000)/1000*h;
    const sr=0.4+((i*7)%5)*0.25;
    ctx.globalAlpha=0.18+((i*13)%10)*0.06;
    const pts=4,outer=sr*2.2,inner=sr*0.8;
    ctx.beginPath();
    for(let k=0;k<pts*2;k++){
      const a=k*Math.PI/pts-Math.PI/4, r=k%2===0?outer:inner;
      k===0?ctx.moveTo(sx+Math.cos(a)*r,sy+Math.sin(a)*r):ctx.lineTo(sx+Math.cos(a)*r,sy+Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fillStyle='rgba('+(200+((i*17)%55))+','+(200+((i*23)%55))+','+(220+((i*11)%35))+',1)'; ctx.fill();
  }
  ctx.globalAlpha=1; ctx.restore();
  ctx.strokeStyle='rgba(200,100,255,0.30)'; ctx.lineWidth=2; ctx.strokeRect(x+5,y+5,w-10,h-10);
}
const fillDanceLeft=fillDance, fillDanceRight=fillDance;

// ── BOXING ────────────────────────────────────────────────────────────────────
function drawBoxingBg(ctx, W, H) {
  // Canvas mat — off-white
  ctx.fillStyle='#e8dfc8'; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.globalAlpha=0.07; ctx.strokeStyle='#8a7050'; ctx.lineWidth=0.8;
  for(let xi=0;xi<W;xi+=10){ctx.beginPath();ctx.moveTo(xi,0);ctx.lineTo(xi,H);ctx.stroke();}
  for(let yi=0;yi<H;yi+=10){ctx.beginPath();ctx.moveTo(0,yi);ctx.lineTo(W,yi);ctx.stroke();}
  ctx.restore();
  // Full ring boundary
  ctx.strokeStyle='rgba(60,30,10,0.75)'; ctx.lineWidth=3;
  ctx.strokeRect(W*0.06,H*0.08,W*0.88,H*0.84);
  // Centre circle
  ctx.strokeStyle='rgba(60,30,10,0.35)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(W/2,H/2,H*0.14,0,Math.PI*2); ctx.stroke();
  // Corner posts (4 corners)
  const postW=14, postH=H*0.65, postTop=(H-postH)/2;
  [[W*0.06-postW/2,postTop],[W*0.94-postW/2,postTop]].forEach(([px,py])=>{
    const pg=ctx.createLinearGradient(px,py,px+postW,py);
    pg.addColorStop(0,'#888'); pg.addColorStop(0.4,'#ddd'); pg.addColorStop(1,'#999');
    ctx.fillStyle=pg; ctx.fillRect(px,py,postW,postH);
    ctx.strokeStyle='#555'; ctx.lineWidth=0.5; ctx.strokeRect(px,py,postW,postH);
  });
  // Ropes — 3 horizontal
  const ropeColors=['#d32f2f','#d32f2f','#1a1a1a'];
  [H*0.28,H*0.50,H*0.72].forEach((ry,ri)=>{
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowBlur=3; ctx.shadowOffsetY=2;
    ctx.strokeStyle=ropeColors[ri]; ctx.lineWidth=5; ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(W*0.06+postW/2,ry); ctx.lineTo(W*0.94-postW/2,ry); ctx.stroke();
    ctx.shadowColor='transparent'; ctx.strokeStyle='rgba(255,255,255,0.28)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(W*0.06+postW/2,ry-1); ctx.lineTo(W*0.94-postW/2,ry-1); ctx.stroke();
    ctx.restore();
  });
}
function fillBoxing(ctx, x, y, w, h) {
  // Ring canvas — off-white
  const cg=ctx.createLinearGradient(x,y,x+w,y+h);
  cg.addColorStop(0,'#f0eadc'); cg.addColorStop(0.5,'#e8e0cc'); cg.addColorStop(1,'#e0d8c0');
  ctx.fillStyle=cg; ctx.fillRect(x,y,w,h);
  ctx.save(); ctx.globalAlpha=0.08; ctx.strokeStyle='#9a8060'; ctx.lineWidth=0.6;
  for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo(x+i*(w/14),y);ctx.lineTo(x+i*(w/14),y+h);ctx.stroke();}
  for(let j=0;j<12;j++){ctx.beginPath();ctx.moveTo(x,y+j*(h/12));ctx.lineTo(x+w,y+j*(h/12));ctx.stroke();}
  ctx.restore();
  // Red corner pads
  const ps=Math.min(w,h)*0.16;
  ctx.save();
  ctx.fillStyle='rgba(210,20,10,0.28)';
  ctx.fillRect(x,y,ps,ps); ctx.fillRect(x+w-ps,y,ps,ps);
  ctx.fillRect(x,y+h-ps,ps,ps); ctx.fillRect(x+w-ps,y+h-ps,ps,ps);
  ctx.restore();
  // ── Ring ropes around edges ──
  const margin=ps*0.5;
  const ropeC=['#c0392b','#c0392b','#1a1a1a'];
  [0.30,0.50,0.70].forEach((t,ri)=>{
    // Horizontal ropes
    const ry=y+h*t;
    ctx.save(); ctx.shadowColor='rgba(0,0,0,0.30)'; ctx.shadowBlur=3; ctx.shadowOffsetY=2;
    ctx.strokeStyle=ropeC[ri]; ctx.lineWidth=Math.max(2.5,h*0.022); ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(x+margin,ry); ctx.lineTo(x+w-margin,ry); ctx.stroke();
    ctx.shadowColor='transparent'; ctx.strokeStyle='rgba(255,255,255,0.26)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+margin,ry-0.8); ctx.lineTo(x+w-margin,ry-0.8); ctx.stroke();
    ctx.restore();
  });
  // Boxing gloves centred
  function drawGlove(gcx,gcy,gside,flip){
    ctx.save(); ctx.globalAlpha=0.70;
    const gr=Math.min(w,h)*0.13;
    ctx.fillStyle=flip?'#1565c0':'#d32f2f';
    ctx.beginPath(); ctx.ellipse(gcx+gside*gr*0.3,gcy,gr*0.75,gr*0.60,-0.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=flip?'rgba(13,71,161,0.9)':'rgba(183,28,28,0.9)';
    ctx.beginPath(); ctx.ellipse(gcx,gcy-gr*0.25,gr*0.50,gr*0.38,0.2,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.30)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(gcx+gside*gr*0.3,gcy,gr*0.75,gr*0.60,-0.2,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  drawGlove(x+w*0.35,y+h*0.5,-1,false);
  drawGlove(x+w*0.65,y+h*0.5,1,true);
}
const fillBoxingLeft=fillBoxing, fillBoxingRight=fillBoxing;

// ── TRACK & FIELD ─────────────────────────────────────────────────────────────
function drawTrackFieldBg(ctx, W, H) {
  // Tartan track — orange-red
  gfx.linearFill(ctx, W, H, [[0,'#b83000'],[0.5,'#cc3800'],[1,'#a82a00']]);
  // Track grain
  ctx.save(); ctx.globalAlpha=0.06;
  for(let i=0;i<H;i+=3){ctx.fillStyle=i%6?'#000':'#fff';ctx.fillRect(0,i,W,1.5);}
  ctx.restore();
  // Infield (inner grass ellipse)
  ctx.save(); ctx.globalAlpha=0.65; ctx.fillStyle='#2e7d32';
  ctx.beginPath(); ctx.ellipse(W/2,H/2,W*0.40,H*0.33,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
  // Track lanes (elliptical arcs)
  ctx.strokeStyle='rgba(255,255,255,0.65)'; ctx.lineWidth=1.5;
  [0.44,0.50,0.56,0.62,0.68,0.74,0.80,0.86].forEach(f=>{
    ctx.beginPath(); ctx.ellipse(W/2,H/2,W*f*0.5,H*f*0.45,0,0,Math.PI*2); ctx.stroke();
  });
  // Start/Finish line
  ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.02); ctx.lineTo(W*0.5,H*0.42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.5,H*0.58); ctx.lineTo(W*0.5,H*0.98); ctx.stroke();
}
function fillTrackField(ctx, x, y, w, h) {
  // Tartan surface
  const g=ctx.createLinearGradient(x,y,x+w,y+h);
  g.addColorStop(0,'#b83000'); g.addColorStop(0.5,'#cc3800'); g.addColorStop(1,'#a82a00');
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h);
  // Tartan grain texture
  ctx.save(); ctx.globalAlpha=0.06;
  for(let i=0;i<h;i+=3){ctx.fillStyle=i%6?'rgba(0,0,0,0.4)':'rgba(255,255,255,0.2)';ctx.fillRect(x,y+i,w,1.5);}
  ctx.restore();
  // Lane lines
  ctx.save(); ctx.globalAlpha=0.30; ctx.strokeStyle='rgba(255,255,255,0.80)'; ctx.lineWidth=1.2;
  for(let i=1;i<8;i++){
    const ly=y+h*(0.10+i*(0.80/8));
    ctx.beginPath(); ctx.moveTo(x,ly); ctx.lineTo(x+w,ly); ctx.stroke();
  }
  ctx.restore();
  // Running track symbol (curved arrow/figure)
  ctx.save(); ctx.globalAlpha=0.28; ctx.strokeStyle='rgba(255,220,180,0.80)'; ctx.lineWidth=Math.max(2,Math.min(w,h)*0.025); ctx.lineCap='round';
  const rcx=x+w*0.5, rcy=y+h*0.45, rr=Math.min(w,h)*0.24;
  ctx.beginPath(); ctx.arc(rcx,rcy,rr,Math.PI*0.15,Math.PI*1.85); ctx.stroke();
  // Arrow head at end of arc
  const aAngle=Math.PI*1.85;
  const ax=rcx+Math.cos(aAngle)*rr, ay=rcy+Math.sin(aAngle)*rr;
  ctx.beginPath();
  ctx.moveTo(ax,ay);
  ctx.lineTo(ax-rr*0.18,ay-rr*0.12);
  ctx.moveTo(ax,ay);
  ctx.lineTo(ax+rr*0.05,ay-rr*0.20);
  ctx.stroke();
  ctx.restore();
  // Starting blocks (bottom)
  ctx.save(); ctx.globalAlpha=0.35;
  const bx=x+w*0.5, by=y+h*0.82, bs=Math.min(w,h)*0.07;
  ctx.fillStyle='rgba(255,200,100,0.80)';
  [[-1.2,0],[1.2,0.5]].forEach(([ox,oy])=>{
    ctx.beginPath();
    ctx.moveTo(bx+ox*bs,by+oy*bs);
    ctx.lineTo(bx+ox*bs+bs*1.4,by+oy*bs);
    ctx.lineTo(bx+ox*bs+bs,by+oy*bs+bs*0.7);
    ctx.lineTo(bx+ox*bs-bs*0.4,by+oy*bs+bs*0.7);
    ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}
const fillTrackFieldLeft=fillTrackField, fillTrackFieldRight=fillTrackField;

// ─── PRE-SHAPE DECORATION FUNCTIONS ──────────────────────────────────────────
// Called after ticket fill but BEFORE the shape backdrop, so decorations appear
// behind the shape (visible around the shape perimeter).

function drawBaseballBatsPreShape(ctx, x, y, w, h, cy, maxR, side) {
  const cx = x + w / 2;
  // Size bats relative to shape — long enough to be visible behind the plate
  const batLen = Math.min(Math.min(w, h) * 0.85, maxR * 2.8, 320);
  const batW   = batLen * 0.07;   // barrel diameter
  ctx.save();
  ctx.globalAlpha = 0.82;  // mostly opaque — prominent like reference image

  // drawBat: bat drawn along local x-axis with barrel at +x, knob at -x
  // angle=0 → barrel points right; angle=-3π/4 → barrel points upper-left (10 o'clock)
  function drawBat(angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const kx = -batLen * 0.50;  // knob centre x

    // ── Grip tape zone ─────────────────────────────────────────────────────
    // Dark charcoal tape from knob to ~25% of bat length
    const gripEnd = -batLen * 0.25;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(kx,      -batW * 0.14);
    ctx.lineTo(gripEnd, -batW * 0.15);
    ctx.lineTo(gripEnd,  batW * 0.15);
    ctx.lineTo(kx,       batW * 0.14);
    ctx.closePath();
    // Base tape colour
    ctx.fillStyle = '#2a2a30';
    ctx.fill();
    // Tape wrap diagonal lines
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(60,60,70,0.85)';
    ctx.lineWidth   = Math.max(1, batW * 0.09);
    for (let gx = kx; gx < gripEnd; gx += batLen * 0.035) {
      ctx.beginPath(); ctx.moveTo(gx, -batW * 0.18); ctx.lineTo(gx + batLen * 0.025, batW * 0.18); ctx.stroke();
    }
    // Bright stripe highlight on tape
    ctx.strokeStyle = 'rgba(120,120,140,0.40)';
    ctx.lineWidth   = batW * 0.045;
    ctx.beginPath(); ctx.moveTo(kx, -batW * 0.04); ctx.lineTo(gripEnd - batLen*0.02, -batW * 0.04); ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ── Knob ───────────────────────────────────────────────────────────────
    const knobR = batW * 0.75;
    const kg = ctx.createRadialGradient(kx - knobR * 0.2, -knobR * 0.2, 0, kx, 0, knobR * 1.1);
    kg.addColorStop(0, '#c0784a');
    kg.addColorStop(1, '#3a1004');
    ctx.fillStyle = kg;
    ctx.beginPath(); ctx.arc(kx, 0, knobR, 0, Math.PI * 2); ctx.fill();

    // ── Bat body (handle → shoulder → barrel) ──────────────────────────────
    const bodyGrad = ctx.createLinearGradient(-batLen * 0.5, 0, batLen * 0.5, 0);
    bodyGrad.addColorStop(0,    '#4a1a06');
    bodyGrad.addColorStop(0.22, '#7a3a10');
    bodyGrad.addColorStop(0.50, '#c07838');
    bodyGrad.addColorStop(0.75, '#d49050');
    bodyGrad.addColorStop(0.90, '#be7830');
    bodyGrad.addColorStop(1,    '#9a5828');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    // Handle (thin, from knob shoulder to taper point)
    ctx.moveTo(-batLen * 0.48, -batW * 0.14);
    ctx.lineTo(-batLen * 0.10, -batW * 0.17);
    // Shoulder taper — bezier into barrel
    ctx.bezierCurveTo(
       batLen * 0.08, -batW * 0.47,
       batLen * 0.30, -batW * 0.54,
       batLen * 0.50, -batW * 0.52);
    // Barrel end cap (rounded)
    ctx.quadraticCurveTo( batLen * 0.545, -batW * 0.52,  batLen * 0.535,  0);
    ctx.quadraticCurveTo( batLen * 0.545,  batW * 0.52,  batLen * 0.50,   batW * 0.52);
    // Barrel back through shoulder
    ctx.bezierCurveTo(
       batLen * 0.30,  batW * 0.54,
       batLen * 0.08,  batW * 0.47,
      -batLen * 0.10,  batW * 0.17);
    ctx.lineTo(-batLen * 0.48,  batW * 0.14);
    ctx.closePath();
    ctx.fill();

    // Wood grain on barrel
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#3a1508';
    ctx.lineWidth   = Math.max(0.5, batW * 0.06);
    for (let gx2 = -batLen * 0.08; gx2 < batLen * 0.52; gx2 += batLen * 0.07) {
      ctx.beginPath();
      ctx.moveTo(gx2, -batW * 0.44);
      ctx.lineTo(gx2 + batLen * 0.025, batW * 0.44);
      ctx.stroke();
    }
    ctx.restore();

    // Highlight sheen along top of barrel
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = 'rgba(255,215,140,0.90)';
    ctx.lineWidth   = batW * 0.18;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(-batLen * 0.44, -batW * 0.07);
    ctx.lineTo( batLen * 0.50, -batW * 0.17);
    ctx.stroke();
    ctx.restore();

    // Outer stroke for crispness
    ctx.strokeStyle = 'rgba(30,10,0,0.55)';
    ctx.lineWidth   = Math.max(0.8, batW * 0.06);
    ctx.lineJoin    = 'round';
    ctx.stroke();

    ctx.restore();
  }

  // Left bat: barrel upper-left (≈10 o'clock), right bat: barrel upper-right (≈2 o'clock)
  // In canvas coords (y-down), barrel pointing upper-left = rotate(-3π/4), upper-right = rotate(-π/4)
  drawBat(-Math.PI * 0.75);   // barrel → upper-left
  drawBat(-Math.PI * 0.25);   // barrel → upper-right
  ctx.restore();
}

// Add drawPreShape for softball too (same bats)
function drawSoftballBatsPreShape(ctx, x, y, w, h, cy, maxR, side) {
  drawBaseballBatsPreShape(ctx, x, y, w, h, cy, maxR, side);
}

function drawRugbyUprights(ctx, x, y, w, h, cy, maxR, side) {
  // Draw H-shaped rugby uprights centred, sized to extend from near the shape top
  // to near the ticket top area — visible behind the shape
  const cx=x+w/2;
  const upW=w*0.35, postH=h*0.55;
  const crossY=cy - maxR*0.55; // crossbar near the shape equator
  const topY=y + h*0.06;
  ctx.save(); ctx.globalAlpha=0.20;
  ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=Math.max(2.5, w*0.012); ctx.lineCap='round';
  // Left post
  ctx.beginPath(); ctx.moveTo(cx-upW/2, crossY); ctx.lineTo(cx-upW/2, topY); ctx.stroke();
  // Right post
  ctx.beginPath(); ctx.moveTo(cx+upW/2, crossY); ctx.lineTo(cx+upW/2, topY); ctx.stroke();
  // Crossbar (H middle)
  ctx.beginPath(); ctx.moveTo(cx-upW/2, crossY); ctx.lineTo(cx+upW/2, crossY); ctx.stroke();
  ctx.restore();
}

// ─── SPORT CONFIGS — defined AFTER all fill functions so references resolve ───
const SPORTS = {
  hockey:     { name:'HOCKEY',     emoji:'🏒', shapeSVG:'circle',   textColor:'#ffffff', lightTicket:false, drawBg:drawHockeyBg,     fillLeft:fillPuckLeft,       fillRight:fillPuckRight },
  soccer:     { name:'SOCCER',     emoji:'⚽', shapeSVG:'pentagon', textColor:'#ffffff', lightTicket:true,  drawBg:drawSoccerBg,     fillLeft:fillSoccerBallLeft, fillRight:fillSoccerBallRight },
  football:   { name:'FOOTBALL',   emoji:'🏈', shapeSVG:'oval',     textColor:'#ffffff', lightTicket:false, drawBg:drawFootballBg,   fillLeft:fillFootballLeft,   fillRight:fillFootballRight },
  baseball:   { name:'BASEBALL',   emoji:'⚾', shapeSVG:'circle',   textColor:'#1a237e', lightTicket:true,  drawBg:drawBaseballBg,   fillLeft:fillBaseballLeft,   fillRight:fillBaseballRight },
  softball:   { name:'SOFTBALL',   emoji:'🥎', shapeSVG:'circle',   textColor:'#880e4f', lightTicket:true,  drawBg:drawSoftballBg,   fillLeft:fillSoftballLeft,   fillRight:fillSoftballRight },
  basketball: { name:'BASKETBALL', emoji:'🏀', shapeSVG:'circle',   textColor:'#ffffff', lightTicket:false, drawBg:drawBasketballBg, fillLeft:fillBasketballLeft, fillRight:fillBasketballRight },
  waterpolo:  { name:'WATER POLO', emoji:'🤽', shapeSVG:'circle',   textColor:'#ffffff', lightTicket:true,  drawBg:drawWaterPoloBg,  fillLeft:fillWaterPoloLeft,  fillRight:fillWaterPoloRight },
  volleyball: { name:'VOLLEYBALL', emoji:'🏐', shapeSVG:'circle',   textColor:'#1a237e', lightTicket:true,  drawBg:drawVolleyballBg, fillLeft:fillVolleyballLeft, fillRight:fillVolleyballRight },
  ringette:   { name:'RINGETTE',   emoji:'🔵', shapeSVG:'circle',   textColor:'#ffffff', lightTicket:true,  drawBg:drawRingetteBg,   fillLeft:fillRingetteLeft,   fillRight:fillRingetteRight },
  curling:    { name:'CURLING',    emoji:'🥌', shapeSVG:'circle',   textColor:'#ffffff', lightTicket:false, drawBg:drawCurlingBg,    fillLeft:fillCurlingSheetLeft, fillRight:fillCurlingSheetRight },
  gymnastics:    { name:'GYMNASTICS',     emoji:'🤸', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawGymnasticsBg,      fillLeft:fillGymnasticsLeft,      fillRight:fillGymnasticsRight },
  golf:          { name:'GOLF',           emoji:'⛳', shapeSVG:'circle', textColor:'#1b5e20', lightTicket:true,  drawBg:drawGolfBg,           fillLeft:fillGolfNoFlagsLeft,    fillRight:fillGolfRight },
  figureskating: { name:'FIGURE SKATING', emoji:'⛸️', shapeSVG:'circle', textColor:'#0d47a1', lightTicket:true,  drawBg:drawFigureSkatingBg,  fillLeft:fillFigureSkatingLeft,  fillRight:fillFigureSkatingRight },
  lacrosse:      { name:'LACROSSE',       emoji:'🥍', shapeSVG:'circle', textColor:'#1b5e20', lightTicket:true,  drawBg:drawLacrosseBg,       fillLeft:fillLacrosseLeft,       fillRight:fillLacrosseRight },
  rugby:         { name:'RUGBY',          emoji:'🏉', shapeSVG:'oval',   textColor:'#ffffff', lightTicket:false, drawBg:drawRugbyBg,          fillLeft:fillRugbyLeft,          fillRight:fillRugbyRight, drawPreShape:drawRugbyUprights },
  tennis:        { name:'TENNIS',         emoji:'🎾', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawTennisBg,         fillLeft:fillTennisLeft,         fillRight:fillTennisRight },
  swimming:      { name:'SWIMMING',       emoji:'🥽', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawSwimmingBg,       fillLeft:fillSwimmingLeft,       fillRight:fillSwimmingRight },
  afl:           { name:'AFL',            emoji:'🏉', shapeSVG:'oval',   textColor:'#ffffff', lightTicket:false, drawBg:drawAFLBg,            fillLeft:fillAFLLeft,            fillRight:fillAFLRight },
  wrestling:     { name:'WRESTLING/MMA',  emoji:'🥊', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawWrestlingBg,      fillLeft:fillWrestlingLeft,      fillRight:fillWrestlingRight },
  equestrian:    { name:'EQUESTRIAN',     emoji:'🏇', shapeSVG:'circle', textColor:'#1a1a1a', lightTicket:true,  drawBg:drawEquestrianBg,     fillLeft:fillEquestrianLeft,     fillRight:fillEquestrianRight },
  ultimatefrisbee:{ name:'ULTIMATE FRISBEE', emoji:'🥏', shapeSVG:'circle', textColor:'#1b5e20', lightTicket:true,  drawBg:drawUltimateFrisbeeBg, fillLeft:fillUltimateFrisbeeLeft, fillRight:fillUltimateFrisbeeRight },
  fencing:       { name:'FENCING',        emoji:'🤺', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawFencingBg,         fillLeft:fillFencingLeft,         fillRight:fillFencingRight },
  dance:         { name:'DANCE',          emoji:'💃', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawDanceBg,           fillLeft:fillDanceLeft,           fillRight:fillDanceRight },
  boxing:        { name:'BOXING',         emoji:'🥊', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawBoxingBg,          fillLeft:fillBoxingLeft,          fillRight:fillBoxingRight },
  trackfield:    { name:'TRACK & FIELD',  emoji:'🏃', shapeSVG:'circle', textColor:'#ffffff', lightTicket:false, drawBg:drawTrackFieldBg,      fillLeft:fillTrackFieldLeft,      fillRight:fillTrackFieldRight },
};

// Cinematic vignette for sport posters: deep centre-to-edge darkening plus
// two diagonal corner crushes. rect selects the fill region; corners
// selects the two anchor points for the corner crushes. Both default to
// the full canvas so the common non-clipped call is just:
//   drawSportVignette(ctx, W, H)
// The letter-format branch reuses this with the content-area rect and the
// inset corners to keep the effect inside the printable border.
function drawSportVignette(ctx, W, H, rect, corners) {
  const [rx, ry, rw, rh] = rect    || [0, 0, W, H];
  const [ax, ay, bx, by] = corners || [0, 0, W, H];
  const maxWH = Math.max(W, H);

  const ov = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.08, W/2, H/2, maxWH*0.78);
  ov.addColorStop(0, 'rgba(0,0,0,0.0)');
  ov.addColorStop(0.55, 'rgba(0,0,0,0.18)');
  ov.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = ov; ctx.fillRect(rx, ry, rw, rh);

  const cc = ctx.createRadialGradient(ax, ay, 0, ax, ay, maxWH*0.5);
  cc.addColorStop(0, 'rgba(0,0,0,0.22)'); cc.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cc; ctx.fillRect(rx, ry, rw, rh);

  const cc2 = ctx.createRadialGradient(bx, by, 0, bx, by, maxWH*0.5);
  cc2.addColorStop(0, 'rgba(0,0,0,0.22)'); cc2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cc2; ctx.fillRect(rx, ry, rw, rh);
}

// ─── MAIN GENERATE ────────────────────────────────────────────────────────────
function _runGeneratePoster() {
  if (currentMode==='sport')  generateSportPoster();
  else if (currentMode==='simple') generateSimplePoster();
  else generateStandardPoster();
}

// Draw a logo, optionally on a coloured rounded-rect card.
// x,y,w,h = the logo's draw position and size.
// If window.brandPalette.shapefill is set (and is not pure white), a
// padded rounded rectangle is drawn first so the logo is always legible.
// In logoless mode the img carries a _synthetic marker — skip drawing
// entirely so the banner has a clean empty logo slot.
function drawLogoOnCard(ctx, img, x, y, w, h) {
  if (img && img._synthetic) return;
  const fill = window.brandPalette?.shapefill || '#ffffff';
  const isWhiteFill = fill.replace(/\s/g,'').toLowerCase() === '#ffffff' ||
                      fill.replace(/\s/g,'').toLowerCase() === '#fff';
  if (!isWhiteFill) {
    const pad   = Math.round(Math.min(w, h) * 0.12);
    const cardX = x - pad;
    const cardY = y - pad;
    const cardW = w + pad * 2;
    const cardH = h + pad * 2;
    const cr    = Math.round(Math.min(cardW, cardH) * 0.12);
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, cr);
    ctx.fill();
    ctx.restore();
  }
  ctx.drawImage(img, x, y, w, h);
}

function generateStandardPoster() {
  const state = readFormState();
  const canvas = dom('preview');
  const {W:cW, H:cH} = RATIOS[currentRatio] || RATIOS['16:9'];
  canvas.width=cW; canvas.height=cH;
  const ctx=canvas.getContext('2d');
  // Use the browser's highest-quality resampler for every drawImage call in
  // this render — this is what visibly rescues low-native-resolution PNGs
  // (common with AI-generated prize images) from the default bilinear
  // pixelation. Full-resolution photos and PNGs are unaffected.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const raffleType = state.raffleType;
  const orgName = state.orgName || getRaffleStrings(raffleType).orgFallback;
  const showDetails = state.showDetails;
  const file = state.logoFile;
  // No logo? Fall through — the render pipeline uses a transparent stand-in
  // and drawLogoOnCard skips drawing for _synthetic imgs, so the banner
  // renders normally (with the user's Banner Colors) minus the logo.

  const prizeFileEarly = (raffleType==='prize'||raffleType==='tirage'||raffleType==='esrifa') ? state.prizeFile : null;
  const hasPrizeFileEarly = prizeFileEarly && state.prizeInputActive;

  function doRender(preloadedPrizeImg) {
    const img=new Image();
    img.onload=()=>{
      const { primaryColor, secondaryColor, accentColor, isSingleColored } = deriveStandardColors(img);
      const W=canvas.width, H=canvas.height;
      const isPortrait = H >= W * 0.9;  // 1:1 treated as portrait for stacked layout
      const g=ctx.createLinearGradient(0,0,W,H);
      g.addColorStop(0,secondaryColor); g.addColorStop(0.5,accentColor); g.addColorStop(1,primaryColor);
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      const vig=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.9);
      vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.35)');
      ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);

      // ── Adaptive layout based on aspect ratio ────────────────────────────────
      let lx, ly, rx, ry, tw, th, gap, margin;
      const isLetter = currentRatio === 'letter';
      // Ultra-wide: W/H > 2.6 — tighten margins so tickets don't become slivers
      const isUltraWide = !isPortrait && (W / H > 2.6);
      if (isPortrait) {
        // 0.5" border for letter print format, otherwise standard margin
        margin = isLetter ? 150 : 40;
        gap    = isLetter ? 60  : 50;
        // Draw white paper base for letter format
        if (isLetter) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, W, H);
        }
        tw = W - margin*2;
        th = (H - margin*2 - gap) / 2;
        lx=margin; ly=margin;
        rx=margin; ry=margin+th+gap;
      } else {
        // Side-by-side for landscape — compress margins for ultra-wide
        margin = isUltraWide ? Math.round(H * 0.05) : 44;
        gap    = isUltraWide ? Math.round(H * 0.06) : 60;
        tw=(W-margin*2-gap)/2; th=H-margin*2;
        lx=margin; ly=margin; rx=margin+tw+gap; ry=margin;
      }
      _ticketLayout = {lx, ly, rx, ry, tw, th, bandH: 0};
      // Fill decision: if EITHER image has a white background, both tickets
      // switch to pure white so the two tickets stay visually consistent.
      // (Previously the left ticket could go white for a white-bg logo while
      // the right stayed cream, making the pair look mismatched.)
      const anyWhiteBg = hasWhiteBackground(img) ||
        (preloadedPrizeImg && hasWhiteBackground(preloadedPrizeImg));
      const ticketFill = anyWhiteBg ? '#ffffff' : null;
      const lSide = isPortrait ? 'top' : 'left';
      const rSide = isPortrait ? 'bottom' : 'right';
      drawStdTicket(ctx,lx,ly,tw,th,lSide,ticketFill);
      drawStdTicket(ctx,rx,ry,tw,th,rSide,ticketFill);
      // Logo-colour border around tickets — Letter format only
      if (isLetter) {
        const cr22 = 22;
        ctx.save();
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.82;
        scalloppedRect(ctx, lx, ly, tw, th, cr22, lSide); ctx.stroke();
        scalloppedRect(ctx, rx, ry, tw, th, cr22, rSide); ctx.stroke();
        ctx.restore();
      }
      drawTearLine(ctx, lx, ly, tw, th, gap, isPortrait);

      // Detect square (1:1) layout
      const isSquare = Math.abs(W - H) < 80;

      if (isSquare) {  // 1:1 — both tickets stacked, centre all content
        // ── 1:1 STANDARD LAYOUT ──────────────────────────────────────────────
        // Each ticket occupies ly→ly+th (top) and ry→ry+th (bottom).
        // All content must be centred within its own ticket bounds.

        const lcx = lx + tw/2;  // horizontal centre (same for both tickets)
        const rcx = rx + tw/2;

        // ── LEFT ticket: logo + divider + org name, vertically centred ──────
        const hasShapeCard = window.brandPalette?.shapefill && 
          window.brandPalette.shapefill.replace(/\s/g,'').toLowerCase() !== '#ffffff' &&
          window.brandPalette.shapefill.replace(/\s/g,'').toLowerCase() !== '#fff';
        const maxLogoSz = Math.round(th * (hasShapeCard ? 0.48 : 0.60));
        const sc2 = Math.min(maxLogoSz/img.width, maxLogoSz/img.height);
        const logoW2 = img.width * sc2;
        const logoH2 = img.height * sc2;
        const orgFontSize2 = Math.max(18, Math.round(th * 0.062));
        const divSpacing = Math.round(th * 0.04);

        // Smart text scaling for org name — allow a larger cap when there is no
        // logo, so the name can grow into the space it would otherwise share
        // with the logo (still constrained by fitText's own shrink loop).
        const _sqNoLogo = !!img._synthetic;
        const _sqOrgStartFS = _sqNoLogo ? Math.round(th * 0.11) : orgFontSize2;
        const _sqOrgFit = fitText(ctx, orgName.toUpperCase(), tw - 70, _sqOrgStartFS, 12);
        const lineH2 = _sqOrgFit.lineHeight;

        // Total block: (logo + divider) + org lines. When there is no logo, we
        // drop both the logo allocation and the divider so the org name centres
        // on its own inside the ticket instead of sitting low.
        const _sqLogoAlloc = _sqNoLogo ? 0 : logoH2;
        const _sqDivAlloc  = _sqNoLogo ? 0 : (divSpacing + 8 + divSpacing * 0.5);
        const leftBlockH = _sqLogoAlloc + _sqDivAlloc + lineH2 * _sqOrgFit.lines.length;
        // Centre within top ticket
        const leftBlockTop = ly + (th - leftBlockH) / 2;

        // Draw logo (on grey card if shapefill is set) — no-op when _synthetic
        drawLogoOnCard(ctx, img, lcx - logoW2/2, leftBlockTop, logoW2, logoH2);

        // Draw divider only when a logo is present (nothing to divide otherwise)
        const divY2 = leftBlockTop + _sqLogoAlloc + (_sqNoLogo ? 0 : divSpacing);
        if (!_sqNoLogo) drawOrnDiv(ctx, lcx, divY2, tw * 0.35, primaryColor);

        // Draw org name
        ctx.font = `bold ${_sqOrgFit.fontSize}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
        ctx.textAlign = 'center';
        const orgBaseY = _sqNoLogo
          ? leftBlockTop + _sqOrgFit.fontSize
          : divY2 + divSpacing * 0.5 + _sqOrgFit.fontSize;
        // Strong shadow ensures legibility on any background
        ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=Math.max(2,_sqOrgFit.fontSize*0.07); ctx.lineJoin='round';
        strokeFitLines(ctx, _sqOrgFit.lines, lcx, orgBaseY, lineH2);
        ctx.fillStyle = primaryColor;
        // Subtle adaptive shadow: light halo for dark text on dark bg, faint dark drop for light text
        const _sd1 = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
        ctx.shadowColor=_sd1; ctx.shadowBlur=4; ctx.shadowOffsetY=1;
        drawFitLines(ctx, _sqOrgFit.lines, lcx, orgBaseY, lineH2);
        ctx.shadowBlur=0; ctx.shadowOffsetY=0;

        // Licence number if details on
        if (showDetails) {
          const lic = document.getElementById('licenceNumber').value;
          if (lic) {
            ctx.fillStyle = primaryColor; ctx.globalAlpha = 0.65;
            ctx.font = '14px "Helvetica Neue",Helvetica,Arial,sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Licence ${lic}`, lcx, ly + th - 20);
            ctx.globalAlpha = 1;
          }
        }

        // Gap between tickets — left clean (no bar)

        // ── RIGHT ticket: PRIZE/50-50 RAFFLE, vertically centred in ry→ry+th ─
        const hasPrize = (raffleType==='prize' || raffleType==='tirage' || raffleType==='esrifa') && document.getElementById('prizeImageUpload').files[0] && !document.getElementById('prizeImageUpload').disabled;
        // When a prize image is present, use a smaller raffle type so there is
        // room for the image below.  Otherwise use the full-size centred layout.
        // When prize image present OR showDetails, use compact text so details/image get space.
        const sm2raw = !showDetails && !hasPrize ? 1.15 : 1.0;
        const mainFontSz2 = Math.round(th * (hasPrize || showDetails ? 0.13 : 0.28) * sm2raw);
        const subFontSz2  = Math.round(th * (hasPrize || showDetails ? 0.065 : 0.10) * sm2raw);
        const subGap2     = Math.round(mainFontSz2 * 0.55);
        const ornGap2     = Math.round(14 * sm2raw);
        // Total right block height
        const rBlockH = mainFontSz2 + subGap2 + subFontSz2 + ornGap2 + 10;
        // When details or prize follow, anchor text near top; otherwise centre it
        const rBlockTop = (hasPrize || showDetails)
          ? ry + Math.round(th * 0.05)         // near top — leaves max room below
          : ry + (th - rBlockH) / 2;           // centred — no detail items follow
        const rtyDraw = rBlockTop + mainFontSz2; // alphabetic baseline of "50/50"/"PRIZE"

        // Always draw PRIZE/50-50 text — prize image goes below it (same as 4:5)
        ctx.fillStyle = primaryColor; ctx.textAlign = 'center';
        ctx.strokeStyle = secondaryColor; ctx.lineWidth = 0.5;
        const _sq_S = getRaffleStrings(raffleType);
        const mainTxt2 = _sq_S.mainTxt;
        const lts2 = (raffleType==='5050' || raffleType==='tirage5050' || raffleType==='es5050') ? 6*sm2raw : 8*sm2raw;
        const { sz: _sqFittedSz2, lts: _sqFittedLts2 } = fitMainFontSz(ctx, mainTxt2, lts2, tw - 60, mainFontSz2);
        ctx.font = `bold ${_sqFittedSz2}px Impact,"Arial Black",sans-serif`;
        const ltw2 = mainTxt2.split('').reduce((s,l) => s + ctx.measureText(l).width + _sqFittedLts2, 0) - _sqFittedLts2;
        let xp2 = rcx - ltw2/2;
        mainTxt2.split('').forEach(l => {
          const lw = ctx.measureText(l).width;
          if (!isSingleColored) ctx.strokeText(l, xp2+lw/2, rtyDraw);
          ctx.fillText(l, xp2+lw/2, rtyDraw);
          xp2 += lw + _sqFittedLts2;
        });
        // Shrink sub width so long Custom subheadings stay inside the ticket.
        const fittedSub2 = _sq_S.subTxt
          ? fitBoldFontSz(ctx, _sq_S.subTxt, tw - 60, subFontSz2, 10)
          : subFontSz2;
        // subY: max of natural gap and a guard that keeps sub clear of main.
        const _baseSubY2 = rtyDraw + subGap2;
        const _minSubY2  = rtyDraw + Math.round(_sqFittedSz2 * 0.28) + Math.round(fittedSub2 * 0.72) + 8;
        const subY2 = Math.max(_baseSubY2, _minSubY2);
        ctx.font = `bold ${fittedSub2}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
        if (_sq_S.subTxt) {
          if (!isSingleColored) ctx.strokeText(_sq_S.subTxt, rcx, subY2);
          ctx.fillText(_sq_S.subTxt, rcx, subY2);
        }
        drawOrnDiv(ctx, rcx, subY2 + ornGap2, tw*0.3, primaryColor);
        let dsY2 = subY2 + Math.round(fittedSub2 * 1.4);  // extra gap below ornament so Ticket Packages has breathing room

        if (hasPrize) {
          const pf = document.getElementById('prizeImageUpload').files[0];
          const pi = preloadedPrizeImg || new Image();
          function rp2() {
            const mpw = tw - 80;
            // Max height for prize image: remaining space below the text block
            const maxH2 = showDetails ? 150 : Math.round((ry + th) - dsY2 - 16);
            const ia2 = pi.width/pi.height, ba2 = mpw/maxH2;
            let pw2, ph2;
            if (ia2 > ba2) { pw2 = mpw; ph2 = pw2/ia2; } else { ph2 = maxH2; pw2 = ph2*ia2; }
            const off2 = pi; // Draw prize as-is on Standard Banners (cream ticket = natural bg)
            // Draw prize image below the raffle type text
            ctx.drawImage(off2, rcx - pw2/2, dsY2, pw2, ph2);
            drawStdDetails(ctx, showDetails, rx, tw, ry, th, rcx, dsY2 + ph2 + 10, raffleType, primaryColor);
          }
          if (preloadedPrizeImg) rp2(); else { pi.onload = rp2; pi.src = URL.createObjectURL(pf); }
          return;
        }
        drawStdDetails(ctx, showDetails, rx, tw, ry, th, rcx, dsY2, raffleType, primaryColor);
        return;
      }

      // ── CUSTOM RATIO LAYOUT — fully proportional, vertically centered ─────────
      // Runs when currentRatio === 'custom' for any size not handled by isSquare.
      if (currentRatio === 'custom') {
        const lcx2 = lx + tw / 2;   // left ticket horizontal centre
        const rcx2 = rx + tw / 2;   // right ticket horizontal centre
        const pad  = Math.round(Math.min(tw, th) * 0.06); // inner breathing room
        const avW  = tw - pad * 2;
        const avH  = th - pad * 2;

        // ── LEFT TICKET: Logo + ornament divider + org name, vertically centered ─
        // Logo box: up to 60% of avH tall, full avW wide
        const maxLogoW = avW;
        const maxLogoH = Math.round(avH * 0.60);
        const lScale   = Math.min(maxLogoW / img.width, maxLogoH / img.height);
        const logoW2   = Math.round(img.width  * lScale);
        const logoH2   = Math.round(img.height * lScale);

        // Org name font — smart scaling with fitText. When no logo, allow a
        // larger starting size so the name grows into the vacated space.
        const _cNoLogo = !!img._synthetic;
        const _cOrgStartFS = _cNoLogo
          ? Math.max(20, Math.round(th * 0.13))
          : Math.max(12, Math.round(th * 0.07));
        const _cOrgFit = fitText(ctx, orgName.toUpperCase(), avW * 0.92, _cOrgStartFS, 10);
        const orgFS2 = _cOrgFit.fontSize;
        const orgLH2   = _cOrgFit.lineHeight;
        const divGap2  = Math.round(th * 0.035);
        const divH2    = 8;

        // Measure total block, center it vertically within the ticket. When
        // there is no logo, drop both the logo allocation and the divider so
        // the org name centres on its own.
        const _cLogoAlloc = _cNoLogo ? 0 : logoH2;
        const _cDivAlloc  = _cNoLogo ? 0 : (divGap2 + divH2 + divGap2 * 0.5);
        const leftBlockH = _cLogoAlloc + _cDivAlloc + orgLH2 * _cOrgFit.lines.length;
        let curLY2 = ly + (th - leftBlockH) / 2;

        // Draw logo (on grey card if shapefill is set) — no-op when _synthetic
        drawLogoOnCard(ctx, img, lcx2 - logoW2 / 2, curLY2, logoW2, logoH2);
        curLY2 += _cLogoAlloc + (_cNoLogo ? 0 : divGap2);

        // Draw ornament divider only when a logo is present
        if (!_cNoLogo) {
          drawOrnDiv(ctx, lcx2, curLY2, Math.min(avW * 0.35, 120), primaryColor);
          curLY2 += divH2 + divGap2 * 0.5;
        }

        // Draw org name (stroke pass then fill pass for legibility)
        ctx.font = `bold ${orgFS2}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
        ctx.lineWidth = Math.max(2, orgFS2 * 0.07); ctx.lineJoin = 'round';
        strokeFitLines(ctx, _cOrgFit.lines, lcx2, curLY2 + orgFS2, orgLH2);
        ctx.fillStyle = primaryColor;
        const _sd2 = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
        ctx.shadowColor = _sd2; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
        drawFitLines(ctx, _cOrgFit.lines, lcx2, curLY2 + orgFS2, orgLH2);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // Licence number pinned to ticket bottom
        if (showDetails) {
          const lic2 = document.getElementById('licenceNumber').value;
          if (lic2) {
            const licFS = Math.max(10, Math.round(th * 0.025));
            ctx.fillStyle = primaryColor; ctx.globalAlpha = 0.65;
            ctx.font = `${licFS}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`Licence ${lic2}`, lcx2, ly + th - pad * 0.7);
            ctx.globalAlpha = 1;
          }
        }

        // ── RIGHT TICKET: Raffle text + (prize image) + details ───────────────────
        const hasPrize2 = (raffleType === 'prize' || raffleType === 'tirage' || raffleType === 'esrifa') &&
          document.getElementById('prizeImageUpload').files[0] &&
          !document.getElementById('prizeImageUpload').disabled;

        ctx.save();
        scalloppedRect(ctx, rx, ry, tw, th, 22, rSide);
        ctx.clip();

        if (hasPrize2) {
          // Prize image gets space priority.
          // Text zone: compact top portion (≈28% of ticket height)
          const txtZoneH = Math.round(th * 0.28);
          const mFS2     = Math.round(txtZoneH * 0.55);
          const sFS2     = Math.round(txtZoneH * 0.26);
          const _c2_S    = getRaffleStrings(raffleType);
          const mainTxt2 = _c2_S.mainTxt;
          const lts2c = 5;
          const { sz: _c2FittedSz, lts: _c2FittedLts } = fitMainFontSz(ctx, mainTxt2, lts2c, avW - 20, mFS2);

          // Text: anchor with padding from ticket top
          const mY2 = ry + pad + _c2FittedSz;
          ctx.fillStyle = primaryColor; ctx.textAlign = 'center';
          ctx.strokeStyle = secondaryColor; ctx.lineWidth = 0.5;
          ctx.font = `bold ${_c2FittedSz}px Impact,"Arial Black",sans-serif`;
          const ltw2c = mainTxt2.split('').reduce((s,l) => s + ctx.measureText(l).width + _c2FittedLts, 0) - _c2FittedLts;
          let xp2c = rcx2 - ltw2c / 2;
          mainTxt2.split('').forEach(l => {
            const lw = ctx.measureText(l).width;
            if (!isSingleColored) ctx.strokeText(l, xp2c + lw/2, mY2);
            ctx.fillText(l, xp2c + lw/2, mY2);
            xp2c += lw + _c2FittedLts;
          });
          const _fittedSFS2 = _c2_S.subTxt
            ? fitBoldFontSz(ctx, _c2_S.subTxt, avW - 20, sFS2, 10)
            : sFS2;
          const _baseSY2 = mY2 + Math.round(_c2FittedSz * 0.52);
          const _minSY2  = mY2 + Math.round(_c2FittedSz * 0.28) + Math.round(_fittedSFS2 * 0.72) + 8;
          const sY2 = Math.max(_baseSY2, _minSY2);
          ctx.font = `bold ${_fittedSFS2}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
          if (_c2_S.subTxt) {
            if (!isSingleColored) ctx.strokeText(_c2_S.subTxt, rcx2, sY2);
            ctx.fillText(_c2_S.subTxt, rcx2, sY2);
          }
          drawOrnDiv(ctx, rcx2, sY2 + Math.round(_fittedSFS2 * 0.5) + 5, Math.min(avW * 0.30, 100), primaryColor);

          // Image zone starts below actual text+ornament, not a fixed percentage
          const _textEnd2 = sY2 + Math.round(_fittedSFS2 * 0.5) + 15;
          const imgTop2 = Math.max(ry + txtZoneH, _textEnd2);
          const imgBot2 = ry + th - pad;
          const imgH2   = Math.max(20, imgBot2 - imgTop2);
          const imgW2   = avW;

          const pf2 = document.getElementById('prizeImageUpload').files[0];
          const pi2 = preloadedPrizeImg || new Image();
          function rpCustom() {
            const off2 = pi2; // Draw prize as-is on Standard Banners
            // Scale to fit the image zone while preserving aspect ratio
            const ia2 = pi2.width / pi2.height;
            const ba2 = imgW2 / imgH2;
            let pw2, ph2;
            if (ia2 > ba2) { pw2 = imgW2; ph2 = pw2 / ia2; }
            else            { ph2 = imgH2; pw2 = ph2 * ia2; }
            // Center image within the zone
            const pX2 = rcx2 - pw2 / 2;
            const pY2 = imgTop2 + (imgH2 - ph2) / 2;
            ctx.drawImage(off2, pX2, pY2, pw2, ph2);
            ctx.restore();
            finaliseDownload();
          }
          if (preloadedPrizeImg) rpCustom();
          else { pi2.onload = rpCustom; pi2.src = URL.createObjectURL(pf2); }
          return;
        }

        // No prize image — use compact header when showDetails (same strategy as prize-image path),
        // or full-size centred layout when neither details nor prize image.
        const showDetailsCustom = showDetails;
        if (showDetailsCustom) {
          // Compact header: small raffle type at top, details fill the rest
          const txtZoneH = Math.round(th * 0.28);
          const mFS3     = Math.round(txtZoneH * 0.55);
          const sFS3     = Math.round(txtZoneH * 0.26);
          const _c3_S    = getRaffleStrings(raffleType);
          const mainTxt3 = _c3_S.mainTxt;
          const lts3c = 5;
          const { sz: _c3FittedSz, lts: _c3FittedLts } = fitMainFontSz(ctx, mainTxt3, lts3c, avW - 20, mFS3);
          const mY3 = ry + pad + _c3FittedSz;
          ctx.fillStyle = primaryColor; ctx.textAlign = 'center';
          ctx.strokeStyle = secondaryColor; ctx.lineWidth = 0.5;
          ctx.font = `bold ${_c3FittedSz}px Impact,"Arial Black",sans-serif`;
          const ltw3c = mainTxt3.split('').reduce((s,l) => s + ctx.measureText(l).width + _c3FittedLts, 0) - _c3FittedLts;
          let xp3c = rcx2 - ltw3c / 2;
          mainTxt3.split('').forEach(l => { const lw=ctx.measureText(l).width; if(!isSingleColored)ctx.strokeText(l,xp3c+lw/2,mY3); ctx.fillText(l,xp3c+lw/2,mY3); xp3c+=lw+_c3FittedLts; });
          const _fittedSFS3 = _c3_S.subTxt
            ? fitBoldFontSz(ctx, _c3_S.subTxt, avW - 20, sFS3, 10)
            : sFS3;
          const _baseSY3c = mY3 + Math.round(_c3FittedSz * 0.52);
          const _minSY3c  = mY3 + Math.round(_c3FittedSz * 0.28) + Math.round(_fittedSFS3 * 0.72) + 8;
          const sY3c = Math.max(_baseSY3c, _minSY3c);
          ctx.font = `bold ${_fittedSFS3}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
          if (_c3_S.subTxt) {
            if (!isSingleColored) ctx.strokeText(_c3_S.subTxt, rcx2, sY3c);
            ctx.fillText(_c3_S.subTxt, rcx2, sY3c);
          }
          drawOrnDiv(ctx, rcx2, sY3c + Math.round(_fittedSFS3 * 0.5) + 5, Math.min(avW * 0.30, 100), primaryColor);
          const dsY3c = sY3c + Math.round(_fittedSFS3 * 1.3) + 12;
          drawStdDetails(ctx, showDetails, rx, tw, ry, th, rcx2, dsY3c, raffleType, primaryColor);
          ctx.restore();
          return;
        }

        // No details, no prize image — large centred raffle text
        const mFS3     = Math.min(Math.round(th * 0.33), Math.round(avW * 0.80));
        const sFS3     = Math.round(mFS3 * 0.33);
        const ornGap3  = Math.round(mFS3 * 0.15);
        const rBlockH3 = mFS3 + Math.round(mFS3 * 0.52) + sFS3 + ornGap3 + 8;
        let rY3 = ry + (th - rBlockH3) / 2 + mFS3;  // alphabetic baseline of main text

        const _c3b_S   = getRaffleStrings(raffleType);
        const mainTxt3 = _c3b_S.mainTxt;
        ctx.fillStyle = primaryColor; ctx.textAlign = 'center';
        ctx.strokeStyle = secondaryColor; ctx.lineWidth = 0.5;
        const lts3 = (raffleType === '5050' || raffleType === 'tirage5050' || raffleType === 'es5050') ? 6 : 8;
        const { sz: _c3bFittedSz, lts: _c3bFittedLts } = fitMainFontSz(ctx, mainTxt3, lts3, avW - 20, mFS3);
        ctx.font = `bold ${_c3bFittedSz}px Impact,"Arial Black",sans-serif`;
        const ltw3 = mainTxt3.split('').reduce((s,l) => s + ctx.measureText(l).width + _c3bFittedLts, 0) - _c3bFittedLts;
        let xp3 = rcx2 - ltw3 / 2;
        mainTxt3.split('').forEach(l => {
          const lw = ctx.measureText(l).width;
          if (!isSingleColored) ctx.strokeText(l, xp3 + lw/2, rY3);
          ctx.fillText(l, xp3 + lw/2, rY3);
          xp3 += lw + _c3bFittedLts;
        });
        const _fittedSFS3b = _c3b_S.subTxt
          ? fitBoldFontSz(ctx, _c3b_S.subTxt, avW - 20, sFS3, 10)
          : sFS3;
        const _baseSubY3 = rY3 + Math.round(_c3bFittedSz * 0.52);
        const _minSubY3  = rY3 + Math.round(_c3bFittedSz * 0.28) + Math.round(_fittedSFS3b * 0.72) + 8;
        const subY3 = Math.max(_baseSubY3, _minSubY3);
        ctx.font = `bold ${_fittedSFS3b}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
        if (_c3b_S.subTxt) {
          if (!isSingleColored) ctx.strokeText(_c3b_S.subTxt, rcx2, subY3);
          ctx.fillText(_c3b_S.subTxt, rcx2, subY3);
        }
        drawOrnDiv(ctx, rcx2, subY3 + Math.round(_fittedSFS3b * 0.5) + 5, Math.min(avW * 0.30, 100), primaryColor);
        const dsY3 = subY3 + Math.round(_fittedSFS3b * 0.9) + ornGap3;
        drawStdDetails(ctx, showDetails, rx, tw, ry, th, rcx2, dsY3, raffleType, primaryColor);
        ctx.restore();
        return;
      }

      // ── NON-SQUARE STANDARD LAYOUT (original) ────────────────────────────────
      // Logo
      const _nsNoLogo = !!img._synthetic;
      const ls=isPortrait ? Math.round(th*0.52) : 280;
      const lx2=lx+(tw-ls)/2, ly2=ly+Math.round(th*0.08);
      const sc=Math.min(ls/img.width,ls/img.height);
      const _lw=img.width*sc, _lh=img.height*sc;
      drawLogoOnCard(ctx,img,lx2+(ls-_lw)/2,ly2+(ls-_lh)/2,_lw,_lh);
      const divY=ly2+ls+Math.round(th*0.04);
      // Divider only when a logo is present (nothing to separate otherwise)
      if (!_nsNoLogo) drawOrnDiv(ctx,lx+tw/2,divY,tw*0.35,primaryColor);
      // Org name font — larger starting cap when no logo, so it can grow into
      // the vacated space instead of sitting at the standard header size.
      const orgFontSize = _nsNoLogo
        ? Math.round(th * (isPortrait ? 0.11 : 0.16))
        : (isPortrait ? Math.round(th*0.055) : 30);
      // Org name: smart text scaling — shrinks and wraps to fit
      const _orgFit = fitText(ctx, orgName.toUpperCase(), tw - 70, orgFontSize, 12);
      ctx.font=`bold ${_orgFit.fontSize}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
      ctx.textAlign='center';
      ctx.strokeStyle = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth=Math.max(2,_orgFit.fontSize*0.07); ctx.lineJoin='round';
      // Vertical position: when no logo, centre the whole org-name block within
      // the ticket for balance. Otherwise anchor below the ornamental divider.
      const _orgLines = _orgFit.lines.length;
      const _orgBlockH = _orgFit.fontSize + _orgFit.lineHeight * (_orgLines - 1);
      const _orgStartY = _nsNoLogo
        ? (ly + (th - _orgBlockH) / 2 + _orgFit.fontSize)
        : (divY + _orgFit.fontSize + 6);
      // stroke pass
      strokeFitLines(ctx, _orgFit.lines, lx+tw/2, _orgStartY, _orgFit.lineHeight);
      ctx.fillStyle=primaryColor;
      const _sd3 = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
      ctx.shadowColor=_sd3; ctx.shadowBlur=4; ctx.shadowOffsetY=1;
      drawFitLines(ctx, _orgFit.lines, lx+tw/2, _orgStartY, _orgFit.lineHeight);
      ctx.shadowBlur=0; ctx.shadowOffsetY=0;
      if(showDetails){
        const lic=document.getElementById('licenceNumber').value;
        if(lic){ctx.fillStyle=primaryColor;ctx.globalAlpha=0.65;ctx.font='14px "Helvetica Neue",Helvetica,Arial,sans-serif';ctx.textAlign='center';ctx.fillText(`Licence ${lic}`,lx+tw/2,margin+th-24);ctx.globalAlpha=1;}
      }
      const hasPrize=( raffleType==='prize' || raffleType==='tirage' || raffleType==='esrifa' )&&document.getElementById('prizeImageUpload').files[0]&&!document.getElementById('prizeImageUpload').disabled;
      const enlarge=!showDetails&&!hasPrize, sm=enlarge?1.2:1.0;
      // Letter format with prize image: use compact text so prize image gets more space
      const letterPrize = isLetter && hasPrize;
      // When details are visible (no prize image), use the same compact-header strategy as
      // the prize-image path: small raffle label at top, details fill the remaining space.
      // This is the key fix for custom ultra-wide and letter-size layouts.
      const compactHeader = showDetails && !hasPrize;
      const rtx=rx+tw/2;
      // Clip right ticket so all content stays within the ticket boundary
      ctx.save();
      scalloppedRect(ctx, rx, ry, tw, th, 22, rSide);
      ctx.clip();
      // Scale main font to ticket size.
      // compactHeader / letterPrize → small font anchored at top so details get the rest.
      // enlarge (no details, no prize) → original hardcoded size so landscape ratios look correct.
      const mainFontBase = isPortrait
        ? Math.round(th * ((letterPrize || compactHeader) ? 0.18 : 0.28))
        : (compactHeader ? Math.round(th * 0.20) : ((raffleType==='5050'||raffleType==='tirage5050'||raffleType==='es5050') ? 119 : 120));
      const mainFontSz = Math.round(mainFontBase * sm);
      // Y position of the raffle main text baseline.
      // compactHeader/letterPrize → anchor near ticket top so details can fill below.
      // enlarge landscape → restore original centred position.
      const letterYOffset = isLetter ? 150 : 0;
      const topAnchorY = (tx, fs) => tx + Math.round(fs * 0.92) + Math.max(16, Math.round(th * 0.06));
      const rtyBase = isPortrait
        ? ((letterPrize || compactHeader)
            ? topAnchorY(ry, mainFontSz) + (compactHeader ? 0 : letterYOffset)
            : (enlarge ? ry+th*0.42+letterYOffset : ry+th*0.28+letterYOffset))
        : (compactHeader
            ? topAnchorY(ry, mainFontSz)
            : (enlarge ? ly+th/2-20 : ry + Math.round(th*0.35)));
      const rty = rtyBase;
      ctx.fillStyle=primaryColor; ctx.textAlign='center'; ctx.strokeStyle=secondaryColor; ctx.lineWidth=0.5;
      const _ns_S = getRaffleStrings(raffleType);
      const mainTxt=_ns_S.mainTxt;
      const lts=(raffleType==='5050'||raffleType==='tirage5050'||raffleType==='es5050')?6*sm:8*sm;
      const { sz: _nsFittedSz, lts: _nsFittedLts } = fitMainFontSz(ctx, mainTxt, lts, tw - 60, mainFontSz);
      ctx.font=`bold ${_nsFittedSz}px Impact,"Arial Black",sans-serif`;
      const ltw=mainTxt.split('').reduce((s,l)=>s+ctx.measureText(l).width+_nsFittedLts,0)-_nsFittedLts;
      let xp=rtx-ltw/2;
      mainTxt.split('').forEach(l=>{const lw=ctx.measureText(l).width;if(!isSingleColored)ctx.strokeText(l,xp+lw/2,rty);ctx.fillText(l,xp+lw/2,rty);xp+=lw+_nsFittedLts;});
      // Portrait: cap sub relative to the fitted main so a small fitted main
      // (long Custom Text) doesn't get overrun by a fixed-size sub. Also floor
      // subY to guarantee a gap between main's descent and sub's ascent —
      // the previous formula (0.55 × fitted main) alone was too tight once
      // fitMainFontSz shrank the main below the sub.
      const subFontSzRaw = isPortrait
        ? Math.min(Math.round(th*0.10), Math.round(_nsFittedSz*0.55))
        : Math.round(_nsFittedSz*0.40);
      // Shrink sub width so long Custom subheadings (now up to 40 chars)
      // stay inside the ticket instead of bleeding past its scallop edge.
      const subFontSz = _ns_S.subTxt
        ? fitBoldFontSz(ctx, _ns_S.subTxt, tw - 60, subFontSzRaw, 12)
        : subFontSzRaw;
      const _baseSubY = rty + Math.round(_nsFittedSz * 0.55 * sm);
      const _minSubY  = rty + Math.round(_nsFittedSz * 0.28) + Math.round(subFontSz * 0.72) + 8;
      // Guard sub against overlapping main in BOTH orientations — the
      // landscape branch was previously unprotected, so a shrunk main
      // (long promo text) could be swallowed by sub.
      const subY = Math.max(_baseSubY, _minSubY);
      ctx.font=`bold ${subFontSz}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
      if(_ns_S.subTxt){
        if(!isSingleColored)ctx.strokeText(_ns_S.subTxt,rtx,subY);
        ctx.fillText(_ns_S.subTxt,rtx,subY);
      }
      drawOrnDiv(ctx,rtx,subY+Math.round(18*sm),tw*0.3,primaryColor);
      let dsY=subY+Math.round(subFontSz*1.3);
      if((raffleType==='prize'||raffleType==='tirage'||raffleType==='esrifa')&&hasPrize){
        const pf=document.getElementById('prizeImageUpload').files[0];
        const pi=preloadedPrizeImg||new Image();
        function rp(){
          // Proper fit: scale to fill available space while preserving aspect ratio
          // Letter format: use full remaining vertical space for a larger prize image
          const mpw=tw-80;
          const maxH = isLetter
            ? (showDetails ? 200 : Math.max(200, Math.round((ry + th) - dsY - 20)))
            : (showDetails ? 170 : Math.max(80, Math.round((ry + th) - dsY - 20)));
          const ia=pi.width/pi.height, ba=mpw/maxH;
          let pw,ph; if(ia>ba){pw=mpw;ph=pw/ia;}else{ph=maxH;pw=ph*ia;}
          // Draw prize as-is on Standard Banners (cream ticket provides natural background)
          const off = pi;
          ctx.drawImage(off, rtx-pw/2, dsY, pw, ph);
          dsY=dsY+ph+16;
          drawStdDetails(ctx,showDetails,rx,tw,ry,th,rtx,dsY,raffleType,primaryColor);
          ctx.restore();
        }
        if(preloadedPrizeImg)rp();else{pi.onload=rp;pi.src=URL.createObjectURL(pf);}
        return;
      }
      drawStdDetails(ctx,showDetails,rx,tw,ry,th,rtx,dsY,raffleType,primaryColor);
      ctx.restore();
    };
    if (file) {
      img.src = URL.createObjectURL(file);
    } else {
      img._synthetic = true;
      img.src = TRANSPARENT_1X1_PNG;
    }
  }
  if(hasPrizeFileEarly){const ep=new Image();ep.onload=()=>doRender(ep);ep.src=URL.createObjectURL(prizeFileEarly);}
  else doRender(null);
}

// ═══════════════════════════════════════════════════════════════════════
// SIMPLE POSTER — single-shape banner (mode: 'simple', UI label: "Standard")
// Same functional content as the raffle-ticket template (logo, org, promo
// type, prize image, details, QR) presented on one rounded card instead of
// two scalloped tickets. Design accents: leading-edge accent bar in the
// primary brand colour, a small corner tab in the accent colour, and a
// hairline inner rule that separates the identity zone (logo + org) from
// the message zone (headline + details).
// ═══════════════════════════════════════════════════════════════════════
function generateSimplePoster() {
  const state = readFormState();
  const canvas = dom('preview');
  const {W:cW, H:cH} = RATIOS[currentRatio] || RATIOS['16:9'];
  canvas.width = cW; canvas.height = cH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const raffleType = state.raffleType;
  const orgName = state.orgName || getRaffleStrings(raffleType).orgFallback;
  const showDetails = state.showDetails;
  const file = state.logoFile;

  const prizeFileEarly = (raffleType==='prize' || raffleType==='tirage' || raffleType==='esrifa') ? state.prizeFile : null;
  const hasPrizeFileEarly = prizeFileEarly && state.prizeInputActive;

  function doRender(preloadedPrizeImg) {
    const img = new Image();
    img.onload = () => {
      const { primaryColor, secondaryColor, accentColor, isSingleColored } = deriveStandardColors(img);
      const W = canvas.width, H = canvas.height;
      const isPortrait = H >= W * 0.9;
      const isLetter   = currentRatio === 'letter';
      const noLogo     = !!img._synthetic;

      // ── BACKGROUND: soft brand gradient (same family as Raffle) ──────────
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, secondaryColor);
      g.addColorStop(0.5, accentColor);
      g.addColorStop(1, primaryColor);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const vig = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.9);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // ── SINGLE CARD ──────────────────────────────────────────────────────
      const margin = isLetter ? 150 : Math.max(40, Math.round(Math.min(W, H) * 0.045));
      const cx = margin, cy = margin;
      const cw = W - margin * 2, ch = H - margin * 2;
      const cr = Math.min(28, Math.round(Math.min(cw, ch) * 0.03) + 10);

      // finaliseDownload uses this rect to place the QR pill in the bottom
      // right; anchor it to the card so the QR lands inside the card.
      _ticketLayout = { rx: cx, ry: cy, tw: cw, th: ch, bandH: 0, lx: cx, ly: cy };

      // Drop shadow pass
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.32)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, cx, cy, cw, ch, cr);
      ctx.fill();
      ctx.restore();

      // Card body — warm off-white with a very subtle vertical gradient
      ctx.save();
      const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + ch);
      cardGrad.addColorStop(0, '#ffffff');
      cardGrad.addColorStop(1, '#f7f5f0');
      ctx.fillStyle = cardGrad;
      roundRect(ctx, cx, cy, cw, ch, cr);
      ctx.fill();
      ctx.restore();

      // ── ACCENT BAR (primary color) along leading edge ────────────────────
      const barThick = Math.max(10, Math.round(Math.min(cw, ch) * 0.018));
      ctx.save();
      roundRect(ctx, cx, cy, cw, ch, cr);
      ctx.clip();
      ctx.fillStyle = primaryColor;
      if (isPortrait) ctx.fillRect(cx, cy, cw, barThick);
      else            ctx.fillRect(cx, cy, barThick, ch);
      // Subtle darker inner line where bar meets card, for definition
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      if (isPortrait) ctx.fillRect(cx, cy + barThick, cw, 1);
      else            ctx.fillRect(cx + barThick, cy, 1, ch);
      ctx.restore();

      // ── CORNER TAB — small triangle in accent colour, bottom-right ──────
      ctx.save();
      roundRect(ctx, cx, cy, cw, ch, cr);
      ctx.clip();
      const notch = Math.max(28, Math.round(Math.min(cw, ch) * 0.045));
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(cx + cw, cy + ch - notch);
      ctx.lineTo(cx + cw, cy + ch);
      ctx.lineTo(cx + cw - notch, cy + ch);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // ── HAIRLINE INNER BORDER ────────────────────────────────────────────
      const inset = Math.max(10, Math.round(Math.min(cw, ch) * 0.014));
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.09)';
      ctx.lineWidth = 1;
      roundRect(ctx, cx + inset, cy + inset, cw - inset * 2, ch - inset * 2, Math.max(2, cr - inset));
      ctx.stroke();
      ctx.restore();

      // ── CONTENT AREA ─────────────────────────────────────────────────────
      // Nudge content inward past the accent bar and the hairline.
      const cPad = Math.max(20, Math.round(Math.min(cw, ch) * 0.035));
      const contentX = isPortrait ? cx + inset + cPad : cx + barThick + inset + cPad;
      const contentY = isPortrait ? cy + barThick + inset + cPad : cy + inset + cPad;
      const contentW = cw - (isPortrait ? inset * 2 + cPad * 2 : barThick + inset * 2 + cPad * 2);
      const contentH = ch - (isPortrait ? barThick + inset * 2 + cPad * 2 : inset * 2 + cPad * 2);

      // Decide zone split up-front — a compact layout (details or prize image
      // in the message zone) needs more room for the message; a plain layout
      // gives the identity zone (logo + org) a much bigger share so the logo
      // can fill the whitespace.
      const _hasPrizeEarly = (raffleType === 'prize' || raffleType === 'tirage' || raffleType === 'esrifa') &&
        document.getElementById('prizeImageUpload').files[0] &&
        !document.getElementById('prizeImageUpload').disabled;
      const compactLayout = showDetails || _hasPrizeEarly;

      // ── ZONE SPLIT: identity (logo+org) vs message (headline+details) ──
      let idX, idY, idW, idH, msgX, msgY, msgW, msgH;
      const dividerColor = 'rgba(0,0,0,0.10)';

      if (isPortrait) {
        // Stacked: identity band on top, message below.
        const idFrac = compactLayout ? 0.30 : 0.42;
        const gap = Math.round(contentH * 0.02);
        idX = contentX; idY = contentY;
        idW = contentW; idH = Math.round(contentH * idFrac);
        msgX = contentX; msgY = idY + idH + gap;
        msgW = contentW; msgH = contentH - idH - gap;
        // Horizontal divider
        ctx.save();
        ctx.strokeStyle = dividerColor; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(contentX + contentW * 0.10, idY + idH + gap / 2);
        ctx.lineTo(contentX + contentW * 0.90, idY + idH + gap / 2);
        ctx.stroke();
        ctx.restore();
      } else {
        // Side-by-side: identity left, message right.
        const idFrac = compactLayout ? 0.30 : 0.38;
        const gap = Math.round(contentW * 0.03);
        idX = contentX; idY = contentY;
        idW = Math.round(contentW * idFrac); idH = contentH;
        msgX = idX + idW + gap;
        msgY = contentY;
        msgW = contentW - idW - gap;
        msgH = contentH;
        // Vertical divider
        ctx.save();
        ctx.strokeStyle = dividerColor; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(idX + idW + gap / 2, contentY + contentH * 0.10);
        ctx.lineTo(idX + idW + gap / 2, contentY + contentH * 0.90);
        ctx.stroke();
        ctx.restore();
      }

      // ── IDENTITY ZONE: logo + org name ───────────────────────────────────
      // Compute org name first so we know how much vertical space it needs,
      // then let the logo take whatever remains in the identity zone (up to
      // ~92% of the zone width). This makes the logo fill the available
      // whitespace instead of being capped at a small fraction of min(idW,idH).
      const orgStartFS = noLogo
        ? Math.max(20, Math.round(Math.min(idW, idH) * 0.14))
        : Math.max(14, Math.round(Math.min(idW, idH) * 0.078));
      const orgFit = fitText(ctx, orgName.toUpperCase(), idW - 20, orgStartFS, 11);
      const orgLines = orgFit.lines.length;
      const orgBlockH = orgFit.fontSize + orgFit.lineHeight * (orgLines - 1);

      const spacing   = Math.round(Math.min(idW, idH) * 0.04);
      const zonePad   = Math.max(6, Math.round(Math.min(idW, idH) * 0.03));
      // Reserve org height + spacing + a small padding buffer at the zone edges
      const availLogoH = noLogo
        ? 0
        : Math.max(24, idH - orgBlockH - spacing - zonePad * 2);
      const availLogoW = noLogo ? 0 : Math.max(24, idW - zonePad * 2);
      const sc = noLogo ? 0 : Math.min(availLogoW / img.width, availLogoH / img.height);
      const logoW = img.width  * sc;
      const logoH = img.height * sc;

      const idBlockH  = (noLogo ? 0 : logoH + spacing) + orgBlockH;
      const idBlockTop = idY + (idH - idBlockH) / 2;
      const idCx      = idX + idW / 2;

      // Logo
      drawLogoOnCard(ctx, img, idCx - logoW / 2, idBlockTop, logoW, logoH);

      // Org name — dark stroke for readability on the off-white card
      const orgBaseY = idBlockTop + (noLogo ? 0 : logoH + spacing) + orgFit.fontSize;
      ctx.font = `bold ${orgFit.fontSize}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)';
      ctx.lineWidth = Math.max(2, orgFit.fontSize * 0.06); ctx.lineJoin = 'round';
      strokeFitLines(ctx, orgFit.lines, idCx, orgBaseY, orgFit.lineHeight);
      ctx.fillStyle = primaryColor;
      ctx.shadowColor = isDarkPrimary(primaryColor) ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      drawFitLines(ctx, orgFit.lines, idCx, orgBaseY, orgFit.lineHeight);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Licence line pinned to the bottom of the identity zone
      if (showDetails) {
        const lic = document.getElementById('licenceNumber').value;
        if (lic) {
          const licFS = Math.max(11, Math.round(Math.min(idW, idH) * 0.035));
          ctx.font = `${licFS}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
          ctx.fillStyle = primaryColor; ctx.globalAlpha = 0.65;
          ctx.textAlign = 'center';
          ctx.fillText(`Licence ${lic}`, idCx, idY + idH - 4);
          ctx.globalAlpha = 1;
        }
      }

      // ── MESSAGE ZONE: promo type headline + prize image + details ────────
      const msgCx  = msgX + msgW / 2;
      const S_r    = getRaffleStrings(raffleType);
      const hasPrize = _hasPrizeEarly;

      // Headline zone height reserves more room when there's no details/prize
      const compact = compactLayout;
      const headlineZoneH = compact ? Math.round(msgH * 0.30) : Math.round(msgH * 0.55);
      const mainFS = Math.round(headlineZoneH * 0.55);
      const subFSTarget = Math.round(headlineZoneH * 0.22);
      const lts    = (raffleType === '5050' || raffleType === 'tirage5050' || raffleType === 'es5050') ? 6 : 8;
      const mainTxt = S_r.mainTxt;
      const subTxt  = S_r.subTxt;
      const { sz: fittedMain, lts: fittedLts } = fitMainFontSz(ctx, mainTxt, lts, msgW - 40, mainFS);
      // Shrink the sub so long Custom subheadings (now up to 40 chars) stay
      // inside the message zone instead of bleeding past the card edge.
      const fittedSub = subTxt
        ? fitBoldFontSz(ctx, subTxt, msgW - 40, subFSTarget, 10)
        : subFSTarget;

      // Anchor: near top when compact (leave room for details/prize), else centred
      const gapMainToSub = Math.round(fittedMain * 0.28) + Math.round(fittedSub * 0.72) + 10;
      const headlineTop = compact
        ? msgY + Math.round(msgH * 0.05)
        : msgY + (msgH - (fittedMain + fittedSub + gapMainToSub + 32)) / 2;
      const mainY = headlineTop + fittedMain;

      ctx.fillStyle = primaryColor;
      ctx.textAlign = 'center';
      ctx.strokeStyle = secondaryColor; ctx.lineWidth = 0.5;
      ctx.font = `bold ${fittedMain}px Impact,"Arial Black",sans-serif`;
      const ltw = mainTxt.split('').reduce((s, l) => s + ctx.measureText(l).width + fittedLts, 0) - fittedLts;
      let xp = msgCx - ltw / 2;
      mainTxt.split('').forEach(l => {
        const lw = ctx.measureText(l).width;
        if (!isSingleColored) ctx.strokeText(l, xp + lw / 2, mainY);
        ctx.fillText(l, xp + lw / 2, mainY);
        xp += lw + fittedLts;
      });
      // Sub Y: max of the "natural" baseline offset and a minimum guard that
      // keeps sub's cap-top clear of main's descent even when fitMainFontSz
      // shrinks main hard for a long promo string.
      const _baseSubY = mainY + Math.round(fittedMain * 0.55);
      const _minSubY  = mainY + gapMainToSub;
      const subY = Math.max(_baseSubY, _minSubY);
      ctx.font = `bold ${fittedSub}px "Helvetica Neue",Helvetica,Arial,sans-serif`;
      if (subTxt) {
        if (!isSingleColored) ctx.strokeText(subTxt, msgCx, subY);
        ctx.fillText(subTxt, msgCx, subY);
      }
      drawOrnDiv(ctx, msgCx, subY + Math.round(fittedSub * 0.7) + 6, Math.min(msgW * 0.32, 180), primaryColor);
      let dsY = subY + Math.round(fittedSub * 1.5);

      // Prize image → details underneath
      if (hasPrize) {
        const pf = document.getElementById('prizeImageUpload').files[0];
        const pi = preloadedPrizeImg || new Image();
        const drawPrize = () => {
          const mpw = msgW - 60;
          const maxH = showDetails
            ? Math.min(200, Math.round(msgH * 0.28))
            : Math.max(120, Math.round((msgY + msgH) - dsY - 40));
          const ia = pi.width / pi.height, ba = mpw / maxH;
          let pw, ph;
          if (ia > ba) { pw = mpw; ph = pw / ia; } else { ph = maxH; pw = ph * ia; }
          ctx.drawImage(pi, msgCx - pw / 2, dsY, pw, ph);
          dsY = dsY + ph + 14;
          drawStdDetails(ctx, showDetails, msgX, msgW, msgY, msgH, msgCx, dsY, raffleType, primaryColor);
        };
        if (preloadedPrizeImg) drawPrize();
        else { pi.onload = drawPrize; pi.src = URL.createObjectURL(pf); }
        return;
      }

      drawStdDetails(ctx, showDetails, msgX, msgW, msgY, msgH, msgCx, dsY, raffleType, primaryColor);
    };
    if (file) {
      img.src = URL.createObjectURL(file);
    } else {
      img._synthetic = true;
      img.src = TRANSPARENT_1X1_PNG;
    }
  }
  if (hasPrizeFileEarly) {
    const ep = new Image();
    ep.onload = () => doRender(ep);
    ep.src = URL.createObjectURL(prizeFileEarly);
  } else {
    doRender(null);
  }
}

function drawStdTicket(ctx,x,y,w,h,side,fill){
  const cr=22;
  ctx.save();ctx.shadowColor='rgba(0,0,0,0.52)';ctx.shadowBlur=26;ctx.shadowOffsetX=3;ctx.shadowOffsetY=8;ctx.fillStyle='white';scalloppedRect(ctx,x,y,w,h,cr,side);ctx.fill();ctx.restore();
  ctx.save();ctx.shadowColor='rgba(0,0,0,0.22)';ctx.shadowBlur=55;ctx.shadowOffsetX=0;ctx.shadowOffsetY=18;ctx.fillStyle='white';scalloppedRect(ctx,x,y,w,h,cr,side);ctx.fill();ctx.restore();
  ctx.save();
  if(fill){ctx.fillStyle=fill;}else{const pg=ctx.createLinearGradient(x,y,x,y+h);pg.addColorStop(0,'#fff');pg.addColorStop(0.3,'#fdfbf8');pg.addColorStop(0.7,'#faf7f2');pg.addColorStop(1,'#f4f0ea');ctx.fillStyle=pg;}
  scalloppedRect(ctx,x,y,w,h,cr,side);ctx.fill();ctx.restore();
  ctx.save();scalloppedRect(ctx,x,y,w,h,cr,side);ctx.clip();ctx.globalAlpha=0.022;ctx.strokeStyle='#666';ctx.lineWidth=0.5;for(let r=y+3;r<y+h;r+=4){ctx.beginPath();ctx.moveTo(x,r);ctx.lineTo(x+w,r);ctx.stroke();}ctx.restore();
  ctx.save();ctx.globalAlpha=0.65;ctx.strokeStyle='rgba(255,255,255,0.95)';ctx.lineWidth=1.5;scalloppedRect(ctx,x+1.5,y+1.5,w-3,h-3,Math.max(1,cr-1.5),side);ctx.stroke();ctx.restore();
  ctx.save();ctx.globalAlpha=0.14;ctx.strokeStyle='rgba(0,0,0,1)';ctx.lineWidth=1;scalloppedRect(ctx,x+3,y+3,w-6,h-6,Math.max(1,cr-3),side);ctx.stroke();ctx.restore();
  ctx.save();ctx.strokeStyle='rgba(160,145,120,0.4)';ctx.lineWidth=1;scalloppedRect(ctx,x,y,w,h,cr,side);ctx.stroke();ctx.restore();
}

function drawOrnDiv(ctx,cx,y,hw,color){
  ctx.save();ctx.globalAlpha=0.4;ctx.strokeStyle=color;ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(cx-hw,y);ctx.lineTo(cx-8,y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+8,y);ctx.lineTo(cx+hw,y);ctx.stroke();
  ctx.fillStyle=color;ctx.globalAlpha=0.6;ctx.save();ctx.translate(cx,y);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED DETAIL LINE BUILDER
// Builds structured display lines with packages paired, prize/draw/location
// on their own lines. Used by both Standard and Sport detail renderers.
// Returns array of {text, bold, type} objects representing visual lines.
// ═══════════════════════════════════════════════════════════════════════
function buildDetailDisplayLines(state) {
  const { raffleType } = state;
  const lines = [];
  const S = getRaffleStrings(raffleType);

  // ── Ticket Packages: stored individually — renderer decides layout ─────────
  if (state.packages.length > 0) {
    lines.push({ text: S.pkgTitle, bold: true, type: 'title' });
    // Store each package individually — the renderer will try ALL-on-one-line
    // first, and fall back to ALL-one-per-line for consistency.
    state.packages.forEach(({ tickets, price }) => {
      const label = `${tickets} ${tickets == 1 ? S.ticketSg : S.ticketPl} / $${Math.round(parseFloat(price))}`;
      lines.push({ text: label, bold: false, type: 'pkg' });
    });
  }

  // ── Total Tickets ───────────────────────────────────────────────────────
  if (state.totalTickets) lines.push({ text: S.totalTkts(state.totalTickets), bold: false, type: 'info' });

  // ── Prize information ───────────────────────────────────────────────────
  if (raffleType === '5050' || raffleType === 'tirage5050' || raffleType === 'es5050') {
    if (state.prizeAmount) {
      const maxSales = parseFloat(state.prizeAmount.replace(/,/g, '')) || 0;
      const prizeAmt = Math.floor(maxSales / 2);
      const fmtMoney = n => '$' + (n >= 1000 ? n.toLocaleString('en-US') : n);
      lines.push({ text: S.prize5050(fmtMoney(prizeAmt)), bold: true, type: 'prize' });
      lines.push({ text: S.maxSales(fmtMoney(maxSales)), bold: false, type: 'prizeDetail' });
    }
  } else if (raffleType === 'prize' || raffleType === 'tirage' || raffleType === 'esrifa') {
    if (state.prizeDescription) {
      const pvFmt = state.prizeValue ? `$${state.prizeValue}` : '';
      lines.push({ text: S.winnerGets(state.prizeDescription, pvFmt), bold: true, type: 'prize' });
    }
  }

  // ── Draw information — MUST stay on a single line ──────────────────────
  const dd = state.drawDate;
  const dt = state.drawTime;
  let dtxt = '';
  if (dd || dt) {
    dtxt = S.drawLabel + ' ';
    if (dt) {
      const [hh, mm] = dt.split(':');
      const h = parseInt(hh);
      dtxt += `${h > 12 ? h - 12 : (h === 0 ? 12 : h)}${mm !== '00' ? ':' + mm : ''} ${h >= 12 ? 'pm' : 'am'}`;
    }
    if (dd) {
      const d = new Date(dd + 'T00:00:00');
      dtxt += (dt ? ' ' + S.drawOn + ' ' : '') + d.toLocaleDateString(S.locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    lines.push({ text: dtxt, bold: false, type: 'draw', nowrap: true });
  }

  // ── Location — MUST stay on a single line ──────────────────────────────
  if (state.drawLocation) lines.push({ text: state.drawLocation, bold: false, type: 'location', nowrap: true });

  return lines;
}

function drawStdDetails(ctx,showDetails,rx,tw,margin,th,rtx,curY,raffleType,textColor){
  if(!showDetails){finaliseDownload();return;}

  // ── Build structured display lines ─────────────────────────────────────────
  const displayLines = buildDetailDisplayLines(readFormState());
  if (displayLines.length === 0) { finaliseDownload(); return; }

  // ── Reserve space for QR code at bottom ────────────────────────────────────
  const baseScale = Math.max(1.0, th / 500);
  const _qrUrlDet = (document.getElementById('qrUrl')?.value || '').trim();
  let _bottomRes = Math.round(50 * baseScale);
  if (_qrUrlDet) {
    const _qrFrac = currentRatio === 'letter' ? 0.175 : 0.14;
    const _qsz = Math.round(Math.min(tw, th) * _qrFrac);
    const _pd  = Math.round(_qsz * 0.15);
    const _lfs = Math.max(8, Math.round(_qsz * 0.13));
    _bottomRes = Math.max(_bottomRes, 16 + _qsz + _pd * 2 + _lfs + 8 + 10);
  }
  const maxY = margin + th - _bottomRes;
  const avail = maxY - curY;

  // ── Measure & scale: find the best font size ──────────────────────────────
  // Professional cap: large enough to read comfortably, small enough to look polished
  const maxFS = Math.min(Math.round(36 * baseScale), Math.round(avail / displayLines.length * 0.75));
  const minFS = 7;
  const fontOf = (fs, bold) => bold
    ? `bold ${fs}px "Helvetica Neue",Helvetica,Arial,sans-serif`
    : `${fs}px "Helvetica Neue",Helvetica,Arial,sans-serif`;

  // Measure wrapped lines for a given font size, returns total lines + height
  function measureBlock(fs) {
    const lineH = Math.round(fs * 1.30);
    const titleH = Math.round(fs * 1.55); // extra spacing after title
    const maxW = tw - 60;
    let total = 0;
    let wrappedLines = [];
    // ── Packages: ALL on one line or ALL individual — never mixed ─────────
    const pkgItems = displayLines.filter(d => d.type === 'pkg');
    let pkgOneLine = false;
    if (pkgItems.length > 0) {
      ctx.font = fontOf(fs, false);
      const joined = pkgItems.map(p => p.text).join('     ');
      pkgOneLine = ctx.measureText(joined).width <= maxW;
    }

    for (const item of displayLines) {
      ctx.font = fontOf(fs, item.bold);

      if (item.type === 'pkg') {
        if (pkgOneLine) {
          // Only emit the combined line once (on the first pkg item)
          if (item === pkgItems[0]) {
            const joined = pkgItems.map(p => p.text).join('     ');
            wrappedLines.push({ text: joined, bold: false, type: 'pkg' });
            total += lineH;
          }
          // Skip subsequent pkg items — already combined
        } else {
          // All individual
          wrappedLines.push({ text: item.text, bold: item.bold, type: item.type });
          total += lineH;
        }
      } else if (item.nowrap) {
        // MUST stay on single line — never word-wrap
        wrappedLines.push({ text: item.text, bold: item.bold, type: item.type, nowrap: true });
        total += lineH;
      } else {
        // Standard word wrapping
        const words = item.text.split(' ');
        let line = '', linesForItem = [];
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > maxW && line) {
            linesForItem.push({ text: line, bold: item.bold, type: item.type });
            line = w;
          } else line = test;
        }
        if (line) linesForItem.push({ text: line, bold: item.bold, type: item.type });
        wrappedLines = wrappedLines.concat(linesForItem);
        const itemH = item.type === 'title' ? titleH : lineH;
        total += linesForItem.length * itemH;
      }
    }
    // Check all nowrap lines fit horizontally
    const nowrapFits = wrappedLines.every(ln => {
      if (!ln.nowrap) return true;
      ctx.font = fontOf(fs, ln.bold);
      return ctx.measureText(ln.text).width <= maxW;
    });
    return { wrappedLines, totalH: total, lineH, titleH, nowrapFits };
  }

  // Binary search for best font size that fits vertically AND nowrap lines fit horizontally
  let bestFS = minFS, bestMeasure = measureBlock(minFS);
  let lo = minFS, hi = maxFS;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const m = measureBlock(mid);
    if (m.totalH <= avail * 0.92 && m.nowrapFits) { bestFS = mid; bestMeasure = m; lo = mid + 1; }
    else hi = mid - 1;
  }

  const { wrappedLines, totalH, lineH, titleH } = bestMeasure;

  // ── Vertical centering: position block in middle of available space ────────
  const startY = curY + (avail - totalH) / 2 + bestFS;

  // ── Render ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.font = fontOf(bestFS, false);
  let drawY = startY;

  for (const ln of wrappedLines) {
    if (drawY > maxY) break;
    ctx.font = fontOf(bestFS, ln.bold);
    ctx.fillText(ln.text, rtx, drawY);
    const step = ln.type === 'title' ? titleH : lineH;
    drawY += step;
  }

  finaliseDownload();
}


// ─── SPORT POSTER ─────────────────────────────────────────────────────────────
function generateSportPoster() {
  const state = readFormState();
  const canvas = dom('preview');
  const {W:cW, H:cH} = RATIOS[currentRatio] || RATIOS['16:9'];
  canvas.width=cW; canvas.height=cH;
  const ctx=canvas.getContext('2d');
  // Use the browser's highest-quality resampler for every drawImage call in
  // this render — see generateStandardPoster for rationale.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const raffleType = state.raffleType;
  const orgName = state.orgName || getRaffleStrings(raffleType).teamFallback;
  const showDetails = state.showDetails;
  const file = state.logoFile;
  // No logo? Same story as generateStandardPoster: use a transparent
  // stand-in so the render pipeline still runs; drawLogoOnCard skips
  // drawing for _synthetic imgs.

  const sport=SPORTS[currentSport];
  const W=canvas.width, H=canvas.height;
  const img=new Image();
  img.onload=()=>{
    const { accentColor, lightestColor, darkestColor, lightestLum } = deriveSportColors(img);

    // 1. Background + vignette
    sport.drawBg(ctx,W,H);
    drawSportVignette(ctx, W, H);

    // 2. Ticket geometry — adaptive for portrait vs landscape
    const isPortrait = H >= W * 0.9;  // 1:1 treated as portrait for stacked layout
    const isLetter = currentRatio === 'letter';
    let margin, gap, cr, tw, th, lx, ly, rx, ry, lSide, rSide;
    if (isPortrait) {
      margin = isLetter ? 150 : 40;
      gap    = isLetter ? 60  : 50;
      cr=18;
      // Draw white paper base for letter format, then sport bg clipped inside border
      if (isLetter) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        // Draw sport background clipped to content area (inside the 0.5" border)
        ctx.save();
        ctx.beginPath(); ctx.rect(margin, margin, W - margin*2, H - margin*2); ctx.clip();
        ctx.translate(margin, margin);
        sport.drawBg(ctx, W - margin*2, H - margin*2);
        ctx.restore();
        // Vignette clipped to content area
        ctx.save();
        ctx.beginPath(); ctx.rect(margin, margin, W - margin*2, H - margin*2); ctx.clip();
        drawSportVignette(ctx, W, H,
          [margin, margin, W - margin*2, H - margin*2],
          [margin, margin, W - margin,   H - margin]);
        ctx.restore();
      }
      tw = W - margin*2;
      th = (H - margin*2 - gap) / 2;
      lx=margin; ly=margin; rx=margin; ry=margin+th+gap;
      lSide='top'; rSide='bottom';
    } else {
      // Ultra-wide guard: compress margins proportionally
      const isUltraWide = W / H > 2.6;
      margin = isUltraWide ? Math.round(H * 0.05) : 40;
      gap    = isUltraWide ? Math.round(H * 0.06) : 60;
      cr=18;
      tw=(W-margin*2-gap)/2; th=H-margin*2;
      lx=margin; ly=margin; rx=margin+tw+gap; ry=margin;
      lSide='left'; rSide='right';
    }
    _ticketLayout = {lx, ly, rx, ry, tw, th, bandH: 0};

    function drawTicket(tx,ty,side,fillFn){
      // Layer 1: tight drop shadow
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.52)'; ctx.shadowBlur=26; ctx.shadowOffsetX=3; ctx.shadowOffsetY=8;
      ctx.fillStyle='white'; scalloppedRect(ctx,tx,ty,tw,th,cr,side); ctx.fill(); ctx.restore();
      // Layer 2: wider ambient shadow
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.22)'; ctx.shadowBlur=55; ctx.shadowOffsetX=0; ctx.shadowOffsetY=18;
      ctx.fillStyle='white'; scalloppedRect(ctx,tx,ty,tw,th,cr,side); ctx.fill(); ctx.restore();
      // Layer 3: warm white base fill (same gradient as std ticket)
      ctx.save();
      const pg=ctx.createLinearGradient(tx,ty,tx,ty+th);
      pg.addColorStop(0,'#fff'); pg.addColorStop(0.3,'#fdfbf8'); pg.addColorStop(0.7,'#faf7f2'); pg.addColorStop(1,'#f4f0ea');
      ctx.fillStyle=pg; scalloppedRect(ctx,tx,ty,tw,th,cr,side); ctx.fill(); ctx.restore();
      // Layer 4: sport texture clipped inside
      ctx.save(); scalloppedRect(ctx,tx,ty,tw,th,cr,side); ctx.clip(); fillFn(ctx,tx,ty,tw,th); ctx.restore();
      // Layer 5: subtle horizontal line texture (same as std)
      ctx.save(); scalloppedRect(ctx,tx,ty,tw,th,cr,side); ctx.clip();
      ctx.globalAlpha=0.022; ctx.strokeStyle='#666'; ctx.lineWidth=0.5;
      for(let rl=ty+3;rl<ty+th;rl+=4){ctx.beginPath();ctx.moveTo(tx,rl);ctx.lineTo(tx+tw,rl);ctx.stroke();}
      ctx.restore();
      // Layer 6: inner white highlight border
      ctx.save(); ctx.globalAlpha=0.65; ctx.strokeStyle='rgba(255,255,255,0.95)'; ctx.lineWidth=1.5;
      scalloppedRect(ctx,tx+1.5,ty+1.5,tw-3,th-3,Math.max(1,cr-1.5),side); ctx.stroke(); ctx.restore();
      // Layer 7: subtle inner dark border
      ctx.save(); ctx.globalAlpha=0.14; ctx.strokeStyle='rgba(0,0,0,1)'; ctx.lineWidth=1;
      scalloppedRect(ctx,tx+3,ty+3,tw-6,th-6,Math.max(1,cr-3),side); ctx.stroke(); ctx.restore();
      // Layer 8: warm outer stroke
      ctx.save(); ctx.strokeStyle='rgba(160,145,120,0.4)'; ctx.lineWidth=1;
      scalloppedRect(ctx,tx,ty,tw,th,cr,side); ctx.stroke(); ctx.restore();
    }
    // 3. Sport shape geometry — computed BEFORE drawTicket so the tile fill
    //    functions can align their concentric decorations (soccer ball,
    //    waterpolo splash rings, fencing sword) with the shape via
    //    window._sportFillOpts.shapeCy / shapeR.
    const lcx=lx+tw/2, rcx=rx+tw/2;
    const bandH = 50;
    const R_est = Math.min(tw,th)*0.40;  // estimated radius (used for layout only)

    // BAND_H must be declared BEFORE computeCentredCy because that function
    // closes over it.
    const BAND_H = Math.round(Math.max(54, Math.min(th * 0.135, 84)));
    _ticketLayout.bandH = BAND_H;

    // Centre the sport shape in the ACTUAL visible colored zone between the
    // bands, per ticket side. The two bands are not symmetric:
    //   - text band (drawTextBand) has height BAND_H, on the OUTER edge of
    //     the ticket (top for 'top'/'left'/'right' sides, bottom for 'bottom')
    //   - icon band (drawSportBand) has height bandH, at the BOTTOM of every
    //     ticket in landscape, and at the BOTTOM of the TOP ticket only in
    //     portrait (the portrait bottom ticket gets no icon band).
    //
    // Previous behaviour used symmetric reserves and drove the shape toward
    // the outer band on both tickets in tall ratios (4:5, 1:1). This version
    // reads the side and whether the icon band will actually be drawn.
    function computeCentredCy(tx, ty, tw2, th2, side) {
      const hasTextBandTop    = side !== 'bottom';                   // outer=top
      const hasTextBandBottom = side === 'bottom';                   // outer=bottom
      const hasIconBand       = !isPortrait || side === 'top';        // portrait bottom skips it
      // 6px visual breathing gap between band edge and shape bounding box.
      const gapPx = 6;
      const topReserve = (hasTextBandTop    ? BAND_H : 0) + gapPx;
      const botTextRes = hasTextBandBottom ? BAND_H : 0;
      const botIconRes = hasIconBand        ? bandH  : 0;
      const botReserve = Math.max(botTextRes, botIconRes) + gapPx;
      const innerTop = ty + topReserve;
      const innerBot = ty + th2 - botReserve;
      const innerH   = innerBot - innerTop;
      // Shape radius at most 46% of inner height — leaves a small halo on each
      // side. The old 45% + asymmetric reserves is replaced by symmetric 46%
      // + proper reserves, so the shape reads as balanced.
      const maxR = innerH * 0.46;
      return { cy: innerTop + innerH / 2, maxR };
    }

    const _lCyInfo = computeCentredCy(lx, ly, tw, th, lSide);
    const _rCyInfo = computeCentredCy(rx, ry, tw, th, rSide);
    const lCy = _lCyInfo.cy, lMaxR = _lCyInfo.maxR;
    const rCy = _rCyInfo.cy, rMaxR = _rCyInfo.maxR;

    // Now draw the tickets. Fill functions receive shape geometry via
    // window._sportFillOpts so their sport-specific decorations (soccer
    // ball, waterpolo splash rings, fencing sword) can anchor to the same
    // centre as the shape drawn on top later in the pipeline.
    window._sportFillOpts = { isPortrait, ratio: currentRatio, shapeCy: lCy, shapeR: lMaxR, side: 'left' };
    drawTicket(lx,ly,lSide,sport.fillLeft);
    window._sportFillOpts = { isPortrait, ratio: currentRatio, shapeCy: rCy, shapeR: rMaxR, side: 'right' };
    drawTicket(rx,ry,rSide,sport.fillRight);
    window._sportFillOpts = null;
    drawTearLine(ctx, lx, ly, tw, th, gap, isPortrait);

    // Pre-shape decorations (drawn behind the shape, visible around its edges)
    // NOTE: must be after lCy/rCy/lMaxR/rMaxR are declared above.
    if (sport.drawPreShape) {
      ctx.save(); scalloppedRect(ctx,lx,ly,tw,th,cr,lSide); ctx.clip();
      sport.drawPreShape(ctx,lx,ly,tw,th,lCy,lMaxR,'left');
      ctx.restore();
      ctx.save(); scalloppedRect(ctx,rx,ry,tw,th,cr,rSide); ctx.clip();
      sport.drawPreShape(ctx,rx,ry,tw,th,rCy,rMaxR,'right');
      ctx.restore();
    }

    ctx.save(); scalloppedRect(ctx,lx,ly,tw,th,cr,lSide); ctx.clip();
    const lShape=drawSportBackdrop(ctx,lx,ly,tw,th,currentSport,accentColor,darkestColor,lCy,lMaxR, window.brandPalette?.shapefill||'#ffffff'); ctx.restore();
    ctx.save(); scalloppedRect(ctx,rx,ry,tw,th,cr,rSide); ctx.clip();
    const rShape=drawSportBackdrop(ctx,rx,ry,tw,th,currentSport,accentColor,darkestColor,rCy,rMaxR, window.brandPalette?.shapefill||'#ffffff'); ctx.restore();

    // Expose shape geometry so finaliseDownload can nudge the QR pill away
    // from the sport shape rather than overlapping its bottom-right arc.
    _ticketLayout.lShape = { cx: lShape.cx, cy: lShape.cy, R: lShape.R };
    _ticketLayout.rShape = { cx: rShape.cx, cy: rShape.cy, R: rShape.R };

    // ── isYellowGold: returns true if a colour is in the warm yellow/gold range ──
    // Yellow/gold is problematic on light ticket backgrounds (washes out) AND
    // on dark sport backgrounds (blends with field markings like ice/grass lines).
    // Hue ~35°–70°, saturation >40%, brightness >55%
    function isYellowGold(r, g, b) {
      const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
      if (mx === 0) return false;
      const sat = (mx - mn) / mx;
      const bri = mx / 255;
      if (sat < 0.35 || bri < 0.45) return false;
      // Hue calculation (0–360°)
      let hue;
      if (mx === r) hue = ((g - b) / (mx - mn)) * 60;
      else if (mx === g) hue = (2 + (b - r) / (mx - mn)) * 60;
      else hue = (4 + (r - g) / (mx - mn)) * 60;
      if (hue < 0) hue += 360;
      return hue >= 30 && hue <= 75;
    }

    // 4. Text colour — contrast against the ticket background, avoiding yellow/gold
    //    Ensure the color has sufficient contrast against the ticket (white for light, dark for dark)
    let accentTextCol;
    {
      const [ar,ag,ab]=accentColor;
      const lum=(0.299*ar+0.587*ag+0.114*ab)/255;
      const isGold = isYellowGold(ar,ag,ab);
      if (sport.lightTicket) {
        // Light ticket (white/cream): need DARK text. Use logo color only if dark enough.
        // Threshold: luminance must be <= 0.50 to have enough contrast on white
        accentTextCol = (lum <= 0.50 && !isGold) ? `rgb(${ar},${ag},${ab})` : '#1a1a1a';
      } else {
        // Dark ticket: need LIGHT text. Logo color works if light enough, else white.
        accentTextCol = (lum >= 0.55 && !isGold) ? `rgb(${ar},${ag},${ab})` : '#ffffff';
      }
    }

    // 5. Does the right ticket need the raffle label above the shape?
    //    Only when a prize image is uploaded OR additional details are on.
    const hasPrizeImg=(raffleType==='prize'||raffleType==='tirage'||raffleType==='esrifa')&&document.getElementById('prizeImageUpload').files[0]&&!document.getElementById('prizeImageUpload').disabled;
    const raffleAbove = hasPrizeImg || showDetails;

    // 6. Header zones — each ticket's space from its top edge to the top of its shape
    const shapeTop   = lShape.cy - lShape.R;
    const headerTop  = ly + 10;
    const headerBot  = shapeTop - 10;
    const headerH    = Math.max(headerBot - headerTop, 1);

    // Right ticket header zone (above the right/bottom ticket's shape)
    const rShapeTop  = rShape.cy - rShape.R;
    const rHeaderTop = ry + 10;
    const rHeaderH   = Math.max(rShapeTop - 10 - rHeaderTop, 1);

    // ── Header text sizing ──────────────────────────────────────────────────────
    const orgLabel    = orgName.toUpperCase();
    const _sp_S       = getRaffleStrings(raffleType);
    const raffleLabel = _sp_S.bandLabel;
    // When the raffle type text is already shown inside the shape, use a thank-you message instead
    const rBandLabel  = raffleAbove ? raffleLabel : _sp_S.thankYou;
    const maxTxtW     = tw - 44;

    function splitToLines(text, maxW, font) {
      const measure = (t) => measSpaced(t, headerFS);
      if(measure(text) <= maxW) return [text];
      const words = text.split(' ');
      if(words.length < 2) return [text];
      let bestLines = [text], bestMax = Infinity;
      for(let i=1;i<words.length;i++){
        const l1=words.slice(0,i).join(' '), l2=words.slice(i).join(' ');
        const maxW2=Math.max(measure(l1),measure(l2));
        if(maxW2<bestMax){bestMax=maxW2;bestLines=[l1,l2];}
      }
      return bestLines;
    }

    function measSpaced(text, fs) {
      ctx.font = `900 ${fs}px Impact,"Arial Black",sans-serif`;
      ctx.letterSpacing = (fs * 0.08) + 'px';
      const w = ctx.measureText(text).width;
      ctx.letterSpacing = '0px';
      return w;
    }

    // Font size for org name in left header
    // Cap relative to headerH, but also scale with ticket width for smaller ratios
    let headerFS = Math.min(Math.round(headerH * 0.88), Math.round(tw * 0.12), 72);
    let orgLines = [orgLabel];
    for(; headerFS >= 10; headerFS--) {
      orgLines = splitToLines(orgLabel, maxTxtW, '');
      const lineH2 = headerFS * 1.1;
      const blockH2 = orgLines.length * lineH2;
      const orgOk = orgLines.every(l => measSpaced(l, headerFS) <= maxTxtW);
      if(orgOk && blockH2 <= headerH * 0.95) break;
    }
    orgLines = splitToLines(orgLabel, maxTxtW, '');
    const orgLineH  = headerFS * 1.1;
    const orgBlockH = orgLines.length * orgLineH;

    // Font size for raffle label in right ticket header
    let rHeaderFS = Math.min(Math.round(rHeaderH * 0.88), Math.round(tw * 0.12), 72);
    for(; rHeaderFS >= 10; rHeaderFS--) {
      if(measSpaced(raffleLabel, rHeaderFS) <= maxTxtW) break;
    }

    // ── GUARANTEED-READABLE HEADER BAND SYSTEM ──────────────────────────────
    //
    // Each ticket gets a solid band drawn at its outer (non-scallop) top edge.
    // Band colour = accent colour darkened to ensure ≥7:1 contrast vs white text.
    // Text is always white with drop shadow — readable on every combination.
    //
    // bandH: height of the coloured band. Scales with ticket size but has a
    // comfortable minimum so text is never cramped.

    // (BAND_H declared earlier — see computeCentredCy)

    // Darken any colour until its luminance yields ≥ 7:1 contrast vs white.
    // WCAG AAA threshold: L_bg ≤ 0.0667  (contrast = (1.0+0.05)/(L+0.05) ≥ 7)
    function toAccessibleDark(r,g,b){
      let scale = 1.0;
      for(let iter=0; iter<24; iter++){
        const lr = r*scale/255, lg = g*scale/255, lb = b*scale/255;
        // Linearise sRGB
        const lin = v => v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
        const lum = 0.2126*lin(lr) + 0.7152*lin(lg) + 0.0722*lin(lb);
        const contrast = (1.05)/(lum+0.05);
        if(contrast >= 7.0) break; // WCAG AAA
        scale *= 0.85;
      }
      return [Math.round(r*scale), Math.round(g*scale), Math.round(b*scale)];
    }

    const [ar,ag,ab] = accentColor;
    const [br,bg2,bb] = toAccessibleDark(ar,ag,ab);
    const bandBgColor = `rgb(${br},${bg2},${bb})`;
    // Slightly lighter variant for right-ticket band (visual distinction)
    const [br2,bg3,bb2] = toAccessibleDark(
      Math.min(255,Math.round(ar*1.22)),
      Math.min(255,Math.round(ag*1.22)),
      Math.min(255,Math.round(ab*1.22))
    );
    const bandBgColorR = `rgb(${br2},${bg3},${bb2})`;

    // Draw a text band across the outer top of a ticket (clipped to its shape)
    function drawTextBand(tx, ty, tw2, th2, side2, cr2, label, lines2, bandColor) {
      // Place the band at the OUTER (non-scallop) edge of the ticket.
      // • top ticket (side2==='top')    → outer edge is ty          (top of ticket)
      // • bottom ticket (side2==='bottom') → outer edge is ty+th2-bH (bottom of ticket)
      // • landscape left/right          → outer edge is ty          (top of ticket — horizontal band)
      const bH = BAND_H;
      const bandTop = (side2 === 'bottom') ? (ty + th2 - bH) : ty;
      ctx.save();

      // ── BAND BACKGROUND ─────────────────────────────────────────────────────
      // Clip to the ticket outline so the band corners are rounded/scalloped.
      scalloppedRect(ctx, tx, ty, tw2, th2, cr2, side2);
      ctx.clip();

      // Always use a solid, near-opaque dark band so white text is guaranteed readable.
      // bandColor has already been run through toAccessibleDark (≥6.5:1 vs white).
      ctx.fillStyle = bandColor;
      ctx.fillRect(tx, bandTop, tw2, bH);

      // Refined depth: crisper highlight at the outer edge, softer shadow at the
      // interior edge. Reversed for bottom-side ticket so the "light" edge is
      // always the outer (visually top) edge of the ticket.
      const isBottomSide = (side2 === 'bottom');
      const bgVig = ctx.createLinearGradient(tx, bandTop, tx, bandTop + bH);
      if (isBottomSide) {
        bgVig.addColorStop(0,    'rgba(0,0,0,0.22)');
        bgVig.addColorStop(0.55, 'rgba(0,0,0,0.00)');
        bgVig.addColorStop(1,    'rgba(255,255,255,0.11)');
      } else {
        bgVig.addColorStop(0,    'rgba(255,255,255,0.11)');
        bgVig.addColorStop(0.45, 'rgba(0,0,0,0.00)');
        bgVig.addColorStop(1,    'rgba(0,0,0,0.22)');
      }
      ctx.fillStyle = bgVig;
      ctx.fillRect(tx, bandTop, tw2, bH);

      // Crisp separator line — soft gradient stroke instead of flat white for
      // a more premium look. Fades out at the ticket edges.
      const sepY = isBottomSide ? bandTop + 1 : bandTop + bH - 1;
      const sepGrad = ctx.createLinearGradient(tx, sepY, tx + tw2, sepY);
      sepGrad.addColorStop(0,    'rgba(255,255,255,0.05)');
      sepGrad.addColorStop(0.5,  'rgba(255,255,255,0.40)');
      sepGrad.addColorStop(1,    'rgba(255,255,255,0.05)');
      ctx.strokeStyle = sepGrad;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx, sepY); ctx.lineTo(tx + tw2, sepY); ctx.stroke();

      // ── TEXT ─────────────────────────────────────────────────────────────────
      const cx2 = tx + tw2 / 2;
      const numLines = lines2.length;
      const maxW2 = tw2 - 40;
      // Start at comfortable size, shrink until every line fits within band
      let fs = Math.min(Math.round(bH * 0.50), Math.round(tw2 * 0.10), 52);
      for (; fs >= 9; fs--) {
        ctx.font = `800 ${fs}px 'Plus Jakarta Sans',Helvetica,sans-serif`;
        const lh = fs * 1.20;
        const blockH = numLines * lh;
        const allFit = lines2.every(ln => ctx.measureText(ln).width <= maxW2);
        if (allFit && blockH <= bH * 0.84) break;
      }
      ctx.font = `800 ${fs}px 'Plus Jakarta Sans',Helvetica,sans-serif`;
      const lineH3 = fs * 1.20;
      const totalBlockH = numLines * lineH3;
      const startY = bandTop + (bH - totalBlockH) / 2 + fs * 0.80;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // Step 1: dark stroke for maximum legibility on any background
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = Math.max(2.5, fs * 0.08);
      ctx.lineJoin = 'round';
      lines2.forEach((ln, i) => ctx.strokeText(ln, cx2, startY + i * lineH3));

      // Step 2: bright white fill
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.50)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
      lines2.forEach((ln, i) => ctx.fillText(ln, cx2, startY + i * lineH3));
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.restore();
    }

    // Split label into lines that fit within tw-32px
    function splitLabel(label2, fs, maxW2) {
      ctx.font = `700 ${fs}px 'Plus Jakarta Sans',Helvetica,sans-serif`;
      if(ctx.measureText(label2).width <= maxW2) return [label2];
      const words = label2.split(' ');
      if(words.length < 2) return [label2];
      let best = [label2], bestW = Infinity;
      for(let i=1;i<words.length;i++){
        const l1=words.slice(0,i).join(' '), l2=words.slice(i).join(' ');
        const mw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width);
        if(mw<bestW){bestW=mw;best=[l1,l2];}
      }
      return best;
    }

    // Compute lines for org name and raffle label
    const orgBandLines = splitLabel(orgLabel, Math.round(BAND_H*0.45), tw - 32);
    const raffleBandLines = splitLabel(rBandLabel, Math.round(BAND_H*0.45), tw - 32);

    // drawOrgName: solid band at top of left ticket
    function drawOrgName(cx) {
      drawTextBand(lx, ly, tw, th, lSide, cr, orgLabel, orgBandLines, bandBgColor);
    }

    // drawRaffleLabel: solid band at top of right ticket
    function drawRaffleLabel(cx) {
      drawTextBand(rx, ry, tw, th, rSide, cr, rBandLabel, raffleBandLines, bandBgColorR);
    }

    // Legacy helpers — kept for compatibility but now unused
    function drawStyledLine(text, cx, y) { /* replaced by drawTextBand */ }

    // 7. Left ticket: logo (or org name text-mark when no logo) inside shape.
    // White logos: draw as-is — grey card shape fill provides the contrast background.
    // Coloured logos: run v54 background removal to strip any white/plain background.
    const _noLogo = !!img._synthetic;
    if (!_noLogo) {
      const pad=0.72, sz=lShape.R*2*pad;
      const sc=Math.min(sz/img.width,sz/img.height);
      const iw=img.width*sc, ih=img.height*sc;
      const logoToDraw = isLogoMostlyWhite(img) ? (() => {
        const oc=document.createElement('canvas'); oc.width=img.width; oc.height=img.height;
        oc.getContext('2d').drawImage(img,0,0); return oc;
      })() : (hasWhiteBackground(img) ? removeImageBackground(img) : (() => {
        // Dark-background logo: pass through as-is (dark bg contrasts well inside white shape)
        const oc=document.createElement('canvas'); oc.width=img.width; oc.height=img.height;
        oc.getContext('2d').drawImage(img,0,0); return oc;
      })());
      ctx.save();
      sportShapePath(ctx,lx,ly,tw,th,currentSport,lCy,lMaxR); ctx.clip();
      ctx.drawImage(logoToDraw,lShape.cx-iw/2,lShape.cy-ih/2,iw,ih);
      ctx.restore();
    } else {
      // No logo: render the organization name as a text-mark centered inside
      // the shape (fills the visual role the logo would have occupied) so the
      // shape doesn't read as empty.
      drawOrgNameInShape(ctx, lShape, orgLabel, accentColor);
    }

    drawSportBand(ctx,lx,ly,tw,th,lSide,cr,sport);
    if(showDetails){
      const lic=document.getElementById('licenceNumber').value;
      if(lic){
        ctx.save();
        const licText=`Licence ${lic}`;
        ctx.font=`600 11px "DM Sans",sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        const licW=ctx.measureText(licText).width+18;
        const licY=ly+th-60;
        ctx.fillStyle='rgba(0,0,0,0.50)';
        ctx.beginPath(); ctx.roundRect(lcx-licW/2,licY-9,licW,18,5); ctx.fill();
        const [lr,lg,lb]=lightestLum>0.55?lightestColor:[255,255,255];
        ctx.fillStyle=`rgb(${lr},${lg},${lb})`;
        ctx.fillText(licText,lcx,licY);
        ctx.restore();
      }
    }

    // 9. Right ticket: shape content
    function finishRightTicket(){
      if(!raffleAbove){
        // Default: raffle type text centered inside the shape
        drawRaffleTextInShape(ctx,rcx,rShape,raffleType,accentTextCol,accentColor);
      }
      if(showDetails){
        // Details fill the inside of the shape, vertically centred.
        // Details fill the inside of the shape, vertically centred.
        const shapeInnerTop = rShape.cy - rShape.R + 10;
        drawSportDetails(ctx,showDetails,rx,tw,ry,th,rcx,shapeInnerTop,raffleType,sport,rShape,accentTextCol,accentColor,rCy,rMaxR);
      }
      // Only draw sport band on bottom ticket in landscape (not portrait top/bottom layout)
      if (!isPortrait) drawSportBand(ctx,rx,ry,tw,th,rSide,cr,sport);
      // ── TEXT BANDS ALWAYS LAST — rendered on top of every graphic element ───
      // When no logo, the org name is rendered inside the left shape as a
      // text-mark, so the outer band would be a duplicate. Skip it.
      if (!_noLogo) drawOrgName(lcx);
      drawRaffleLabel(rcx);
      finaliseDownload();
    }

    if(hasPrizeImg){
      const pf=document.getElementById('prizeImageUpload').files[0];
      const pi=new Image();
      pi.onload=()=>{
        const prizeClean=removeImageBackground(pi);
        const pSz=rShape.R*2*0.72;
        const psc=Math.min(pSz/pi.width,pSz/pi.height);
        const pw=pi.width*psc, ph=pi.height*psc;
        // Always draw prize image at full opacity inside the shape
        ctx.save(); sportShapePath(ctx,rx,ry,tw,th,currentSport,rCy,rMaxR); ctx.clip();
        ctx.drawImage(prizeClean,rShape.cx-pw/2,rShape.cy-ph/2,pw,ph);
        ctx.restore();
        finishRightTicket();
      };
      pi.src=URL.createObjectURL(pf);
    } else {
      finishRightTicket();
    }
  };
  if (file) {
    img.src = URL.createObjectURL(file);
  } else {
    img._synthetic = true;
    img.src = TRANSPARENT_1X1_PNG;
  }
}

// Draw 50/50 or PRIZE/RAFFLE text centered inside the sport shape.
// Shape is always white — use dark accent or near-black.
// Return true if a CSS rgb() colour string is perceptually dark
function isDarkPrimary(rgbStr) {
  const m = rgbStr.match(/\d+/g);
  if (!m || m.length < 3) return true;
  const [r,g,b] = m.map(Number);
  const lin = v => { v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); };
  return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b) < 0.18;
}

function drawRaffleTextInShape(ctx, rcx, shapeInfo, raffleType, accentTextCol, accentColor) {
  const {cy, R} = shapeInfo;
  const _shape_S = getRaffleStrings(raffleType);
  const mainTxt = _shape_S.mainTxt;
  const subTxt  = _shape_S.subTxt;
  const isCustom = (raffleType === 'custom' || raffleType === 'custom_fr' || raffleType === 'custom_es');

  // Size text to ~58% of shape radius — constrain using ACTUAL rendered width
  // (letter-spaced) and scale letter-spacing with the fitted font so a shrunk
  // main isn't crushed by a fixed lts.
  const lsStart  = (raffleType==='5050' || raffleType==='tirage5050' || raffleType==='es5050') ? 4 : 6;
  const mfsStart = Math.round(R * 0.58);
  const maxLineW = R * 1.30;

  function fitLines(lines, minSz) {
    let sz = mfsStart, ls = lsStart;
    ctx.font = `900 ${sz}px Impact,"Arial Black",sans-serif`;
    const widest = () => lines.reduce((m, line) => {
      const w = line.split('').reduce((s, ch) => s + ctx.measureText(ch).width + ls, 0) - ls;
      return Math.max(m, w);
    }, 0);
    while (widest() > maxLineW && sz > minSz) {
      sz = Math.max(minSz, sz - 2);
      ls = lsStart * (sz / mfsStart);
      ctx.font = `900 ${sz}px Impact,"Arial Black",sans-serif`;
    }
    return { sz, ls };
  }

  // Start with single-line fit.
  let mainLines = [mainTxt];
  let { sz: mfs, ls } = fitLines(mainLines, 10);

  // For Custom text, if the single-line font had to shrink hard (below ~55%
  // of target), try splitting into 2 lines at the best word boundary — a
  // 2-line layout at a larger font is far more readable than 1 line at 10px.
  if (isCustom && mfs < mfsStart * 0.55) {
    const words = mainTxt.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const candidate = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
        const fit = fitLines(candidate, 10);
        if (!best || fit.sz > best.sz) best = { lines: candidate, ...fit };
      }
      if (best && best.sz > mfs) { mainLines = best.lines; mfs = best.sz; ls = best.ls; }
    }
  }

  // Sub text — shrink to fit horizontally.
  let sfs = Math.round(mfs * 0.42);
  if (subTxt) {
    ctx.font = `bold ${sfs}px "DM Sans","Helvetica Neue",sans-serif`;
    while (ctx.measureText(subTxt).width > maxLineW && sfs > 9) {
      sfs = Math.max(9, sfs - 1);
      ctx.font = `bold ${sfs}px "DM Sans","Helvetica Neue",sans-serif`;
    }
  }

  // Layout — vertically centre the main block + gap + sub inside the shape.
  const mainLineH  = mfs * 1.05;
  const mainBlockH = mainLineH * mainLines.length;
  const gap        = Math.max(4, Math.round(mfs * 0.1));
  const totalH     = mainBlockH + gap + sfs;
  const firstMainY = cy - totalH / 2 + mfs; // baseline of first line
  const mainY      = firstMainY;            // preserved for gradient anchor below
  const subY       = firstMainY + mainLineH * (mainLines.length - 1) + gap + sfs;

  // Build logo-colour gradient — shape is WHITE so gradient must be DARK (luminance <= 0.45)
  // Also avoid yellow/gold hues which are unreadable on white
  const tg = ctx.createLinearGradient(rcx-R, mainY-mfs, rcx-R, subY);
  if(accentColor){
    const [ar,ag,ab]=accentColor;
    const lum=(0.299*ar+0.587*ag+0.114*ab)/255;
    // Check for yellow/gold — fall back to navy if detected
    const mx=Math.max(ar,ag,ab), mn=Math.min(ar,ag,ab);
    const sat=mx===0?0:(mx-mn)/mx;
    let hue=0;
    if(mx!==mn){if(mx===ar)hue=((ag-ab)/(mx-mn))*60;else if(mx===ag)hue=(2+(ab-ar)/(mx-mn))*60;else hue=(4+(ar-ag)/(mx-mn))*60;}
    if(hue<0)hue+=360;
    const isGold2 = sat>0.35 && (mx/255)>0.45 && hue>=30 && hue<=75;
    if(isGold2){
      // Fall back to navy for readability on white shape
      tg.addColorStop(0,'#1a2a4a'); tg.addColorStop(0.5,'#253560'); tg.addColorStop(1,'#1a2a4a');
    } else {
      // Ensure colour is dark enough to read on white shape
      function toDark(r,g,b){
        const l=(0.299*r+0.587*g+0.114*b)/255;
        if(l<=0.45) return [r,g,b];
        const t=Math.min(1,(l-0.45)/(l+0.001));
        return [Math.round(r*(1-t)), Math.round(g*(1-t)), Math.round(b*(1-t))];
      }
      const [r0,g0,b0]=toDark(ar,ag,ab);
      const rH=Math.min(255,Math.round(r0*1.3)), gH=Math.min(255,Math.round(g0*1.3)), bH=Math.min(255,Math.round(b0*1.3));
      const rD=Math.round(r0*0.7), gD=Math.round(g0*0.7), bD=Math.round(b0*0.7);
      tg.addColorStop(0,   `rgb(${rH},${gH},${bH})`);
      tg.addColorStop(0.35,`rgb(${r0},${g0},${b0})`);
      tg.addColorStop(0.55,`rgb(${rH},${gH},${bH})`);
      tg.addColorStop(0.80,`rgb(${rD},${gD},${bD})`);
      tg.addColorStop(1,   `rgb(${r0},${g0},${b0})`);
    }
  } else {
    tg.addColorStop(0,'#1a1a1a'); tg.addColorStop(1,'#1a1a1a');
  }
  // Sub text: avoid gold on white shape
  let subFill='#1a1a1a';
  if(accentColor){
    const [ar,ag,ab]=accentColor;
    const lum=(0.299*ar+0.587*ag+0.114*ab)/255;
    const mx=Math.max(ar,ag,ab), mn=Math.min(ar,ag,ab);
    const sat=mx===0?0:(mx-mn)/mx;
    let hue=0;
    if(mx!==mn){if(mx===ar)hue=((ag-ab)/(mx-mn))*60;else if(mx===ag)hue=(2+(ab-ar)/(mx-mn))*60;else hue=(4+(ar-ag)/(mx-mn))*60;}
    if(hue<0)hue+=360;
    const isGold2 = sat>0.35 && (mx/255)>0.45 && hue>=30 && hue<=75;
    subFill = (lum<=0.55 && !isGold2) ? `rgb(${ar},${ag},${ab})` : '#1a1a1a';
  }

  ctx.save();
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  ctx.font=`900 ${mfs}px Impact,"Arial Black",sans-serif`;

  // Main text — one draw pass per line so wrapping (Custom promo types)
  // stacks cleanly. Each line gets a white halo stroke first for legibility
  // against sport-specific shape decorations, then the dark gradient fill.
  const haloAlpha = 0.85;
  const mainHaloW = Math.max(2, mfs * 0.10);
  mainLines.forEach((line, i) => {
    const y = firstMainY + mainLineH * i;
    const totalLW = line.split('').reduce((s, ch) => s + ctx.measureText(ch).width + ls, 0) - ls;

    // Halo pass
    ctx.strokeStyle = `rgba(255,255,255,${haloAlpha})`;
    ctx.lineWidth = mainHaloW;
    ctx.lineJoin = 'round';
    let hx = rcx - totalLW / 2;
    line.split('').forEach(ch => {
      const lw = ctx.measureText(ch).width;
      ctx.strokeText(ch, hx + lw / 2, y);
      hx += lw + ls;
    });

    // Fill pass
    ctx.fillStyle = tg;
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    let fx = rcx - totalLW / 2;
    line.split('').forEach(ch => {
      const lw = ctx.measureText(ch).width;
      ctx.fillText(ch, fx + lw / 2, y);
      fx += lw + ls;
    });
    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  });

  // Sub text — same halo-then-fill treatment for legibility.
  if (subTxt) {
    ctx.font = `bold ${sfs}px "DM Sans","Helvetica Neue",sans-serif`;
    ctx.strokeStyle = `rgba(255,255,255,${haloAlpha})`;
    ctx.lineWidth = Math.max(2, sfs * 0.12);
    ctx.lineJoin = 'round';
    ctx.strokeText(subTxt, rcx, subY);
    ctx.fillStyle = subFill;
    ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 3;
    ctx.fillText(subTxt, rcx, subY);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// When no logo is uploaded, render the organization name as a text-mark
// centered inside the sport shape. Fills the visual role the logo would have
// occupied so the shape doesn't read as empty. Auto-wraps up to 3 lines and
// binary-search sizes to fit within an inscribed square of the shape.
function drawOrgNameInShape(ctx, shapeInfo, orgLabel, accentColor) {
  if (!orgLabel) return;
  const { cx, cy, R } = shapeInfo;
  // Constrain text to an inscribed square (√2·R side) with generous padding so
  // long names don't kiss the shape border on any sport (circle, oval, pentagon).
  const inscribed = R * Math.SQRT2;
  const maxW = inscribed * 0.82;
  const maxH = inscribed * 0.78;

  // Auto-wrap into 1, 2, or 3 lines and pick the split with the smallest max width.
  function bestSplit(text, targetLines) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 1 || targetLines === 1) return [text];
    const measure = (t) => ctx.measureText(t).width;
    let best = null;
    const tryLines = (lines) => {
      const mw = Math.max(...lines.map(measure));
      if (!best || mw < best.mw) best = { mw, lines };
    };
    if (targetLines === 2) {
      for (let i = 1; i < words.length; i++) {
        tryLines([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
      }
    } else {
      for (let i = 1; i < words.length - 1; i++) {
        for (let j = i + 1; j < words.length; j++) {
          tryLines([
            words.slice(0, i).join(' '),
            words.slice(i, j).join(' '),
            words.slice(j).join(' '),
          ]);
        }
      }
    }
    return best?.lines ?? [text];
  }

  // Binary-search a font size where every line fits in maxW AND the block fits maxH.
  const measureAtSize = (lines, fs) => {
    ctx.font = `900 ${fs}px 'Plus Jakarta Sans','Helvetica Neue',sans-serif`;
    ctx.letterSpacing = (fs * 0.02) + 'px';
    const w = Math.max(...lines.map(l => ctx.measureText(l).width));
    ctx.letterSpacing = '0px';
    return { w, h: lines.length * fs * 1.12 };
  };

  const wordCount = orgLabel.split(/\s+/).filter(Boolean).length;
  const maxTryLines = Math.min(3, Math.max(1, wordCount));
  let best = { lines: [orgLabel], fs: 12, dims: { w: Infinity, h: Infinity } };
  for (let nLines = 1; nLines <= maxTryLines; nLines++) {
    const lines = bestSplit(orgLabel, nLines);
    let lo = 12, hi = Math.round(R * 0.60), fit = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const d = measureAtSize(lines, mid);
      if (d.w <= maxW && d.h <= maxH) { fit = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (fit > best.fs) best = { lines, fs: fit, dims: measureAtSize(lines, fit) };
  }

  // Colour: prefer a darkened accent for brand feel; fall back to near-black
  // when the accent is too pale to be readable on white.
  let fill = '#111827';
  if (accentColor) {
    const [ar, ag, ab] = accentColor;
    const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const lum = 0.2126 * lin(ar) + 0.7152 * lin(ag) + 0.0722 * lin(ab);
    // Darken until we hit ≥ 5:1 on white, capping at pure black
    let scale = 1;
    let cur = lum;
    for (let i = 0; i < 20 && (1.05 / (cur + 0.05)) < 5.0; i++) {
      scale *= 0.85;
      const r2 = ar * scale, g2 = ag * scale, b2 = ab * scale;
      cur = 0.2126 * lin(r2) + 0.7152 * lin(g2) + 0.0722 * lin(b2);
    }
    fill = `rgb(${Math.round(ar * scale)},${Math.round(ag * scale)},${Math.round(ab * scale)})`;
  }

  ctx.save();
  ctx.font = `900 ${best.fs}px 'Plus Jakarta Sans','Helvetica Neue',sans-serif`;
  ctx.letterSpacing = (best.fs * 0.02) + 'px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lineH = best.fs * 1.12;
  const blockH = best.lines.length * lineH;
  const firstBaselineY = cy - blockH / 2 + best.fs;
  // Subtle text shadow for depth — never so strong that it competes with the mark
  ctx.shadowColor = 'rgba(0,0,0,0.10)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = fill;
  best.lines.forEach((ln, i) => ctx.fillText(ln, cx, firstBaselineY + i * lineH));
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.letterSpacing = '0px';
  ctx.restore();
}


function drawTicketBorderGlow(ctx,x,y,w,h,side,cr,color){
  ctx.save();
  ctx.strokeStyle=color; ctx.lineWidth=2; ctx.globalAlpha=0.5;
  scalloppedRect(ctx,x+1,y+1,w-2,h-2,Math.max(1,cr-1),side); ctx.stroke();
  ctx.restore();
}

function drawSportBand(ctx,x,y,w,h,side,cr,sport){
  const bandH=50;
  // For top/bottom stacked layout, place band at inner edge (bottom of top, top of bottom)
  let bandY;
  // Icon band always at the BOTTOM outer (non-scallop) edge of each ticket:
  //   landscape left: bottom  |  landscape right: bottom
  //   portrait top: bottom    |  portrait bottom: bottom (outer, non-scallop)
  if (side==='bottom') bandY = y+h-bandH;  // portrait bottom-ticket: outer bottom
  else bandY = y+h-bandH;                  // all others (top, left, right): their bottom
  ctx.save();
  scalloppedRect(ctx,x,y,w,h,cr,side); ctx.clip();
  const bg=ctx.createLinearGradient(x,bandY,x+w,bandY+bandH);
  bg.addColorStop(0,'rgba(0,0,0,0.72)'); bg.addColorStop(1,'rgba(0,0,0,0.86)');
  ctx.fillStyle=bg; ctx.fillRect(x,bandY,w,bandH);
  const icx=x+w/2, icy=bandY+bandH/2;
  if(sport.name==='RINGETTE'){
    drawRingetteRing(ctx, icx, icy, 15, 7);
  } else if(sport.name==='SOCCER'){
    // Draw a soccer net (goal post with net)
    ctx.save();
    const nw=30, nh=18, nx=icx-nw/2, ny=icy-nh/2;
    // Post frame
    ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(nx,ny+nh); ctx.lineTo(nx+nw,ny+nh); ctx.lineTo(nx+nw,ny); ctx.stroke();
    // Crossbar
    ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(nx+nw,ny); ctx.stroke();
    // Net lines vertical (inside goal)
    ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=0.9;
    for(let i=1;i<5;i++){const vx=nx+i*(nw/5);ctx.beginPath();ctx.moveTo(vx,ny);ctx.lineTo(vx+nh*0.35,ny+nh);ctx.stroke();}
    // Net lines horizontal
    for(let j=1;j<4;j++){const vy=ny+j*(nh/4);ctx.beginPath();ctx.moveTo(nx,vy);ctx.lineTo(nx+nw,vy+j*1.5);ctx.stroke();}
    // Ground line
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(nx-5,ny+nh); ctx.lineTo(nx+nw+5,ny+nh); ctx.stroke();
    ctx.restore();
  } else if(sport.name==='GOLF') {
    // Small golf flag with pole
    ctx.save();
    const poleH = 18, poleX2 = icx - 2;
    ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=1.5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(poleX2, icy-poleH*0.5); ctx.lineTo(poleX2, icy+poleH*0.5); ctx.stroke();
    ctx.fillStyle='#e53935';
    const fW2=10, fH2=8;
    ctx.beginPath();
    ctx.moveTo(poleX2, icy-poleH*0.5);
    ctx.lineTo(poleX2+fW2, icy-poleH*0.5+fH2*0.5);
    ctx.lineTo(poleX2, icy-poleH*0.5+fH2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if(sport.name==='FIGURE SKATING') {
    // No icon drawn — clean band for figure skating
  } else if(sport.name==='BASEBALL') {
    // Baseball — white ball with red stitching curves
    ctx.save();
    const br=13;
    // Ball
    const bg=ctx.createRadialGradient(icx-br*0.3,icy-br*0.3,1,icx,icy,br);
    bg.addColorStop(0,'rgba(255,255,255,0.97)'); bg.addColorStop(1,'rgba(230,225,218,0.92)');
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(icx,icy,br,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(220,215,205,0.6)'; ctx.lineWidth=0.7; ctx.beginPath(); ctx.arc(icx,icy,br,0,Math.PI*2); ctx.stroke();
    // Red stitching — two C-curve pairs
    ctx.strokeStyle='rgba(200,30,30,0.88)'; ctx.lineWidth=1.3; ctx.lineCap='round';
    // Left seam
    ctx.beginPath(); ctx.moveTo(icx-br*0.35,icy-br*0.75); ctx.quadraticCurveTo(icx-br*0.90,icy, icx-br*0.35,icy+br*0.75); ctx.stroke();
    // Right seam
    ctx.beginPath(); ctx.moveTo(icx+br*0.35,icy-br*0.75); ctx.quadraticCurveTo(icx+br*0.90,icy, icx+br*0.35,icy+br*0.75); ctx.stroke();
    // Stitch ticks on left seam
    ctx.lineWidth=0.8;
    [-0.62,-0.28,0,0.28,0.62].forEach(t=>{
      const cy2=icy+t*br*0.88;
      const cx2=icx-br*(0.52-Math.abs(t)*0.22);
      ctx.beginPath(); ctx.moveTo(cx2-2,cy2-2.5); ctx.lineTo(cx2+1,cy2+2.5); ctx.stroke();
    });
    // Stitch ticks on right seam
    [-0.62,-0.28,0,0.28,0.62].forEach(t=>{
      const cy2=icy+t*br*0.88;
      const cx2=icx+br*(0.52-Math.abs(t)*0.22);
      ctx.beginPath(); ctx.moveTo(cx2+2,cy2-2.5); ctx.lineTo(cx2-1,cy2+2.5); ctx.stroke();
    });
    ctx.restore();
  } else if(sport.name==='SOFTBALL') {
    // Softball — yellow-white ball with magenta stitching
    ctx.save();
    const sr=13;
    const sg=ctx.createRadialGradient(icx-sr*0.3,icy-sr*0.3,1,icx,icy,sr);
    sg.addColorStop(0,'rgba(255,252,200,0.97)'); sg.addColorStop(1,'rgba(230,220,140,0.92)');
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(icx,icy,sr,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(210,200,120,0.5)'; ctx.lineWidth=0.7; ctx.beginPath(); ctx.arc(icx,icy,sr,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(210,20,100,0.85)'; ctx.lineWidth=1.3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(icx-sr*0.35,icy-sr*0.75); ctx.quadraticCurveTo(icx-sr*0.90,icy, icx-sr*0.35,icy+sr*0.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx+sr*0.35,icy-sr*0.75); ctx.quadraticCurveTo(icx+sr*0.90,icy, icx+sr*0.35,icy+sr*0.75); ctx.stroke();
    ctx.lineWidth=0.8;
    [-0.62,-0.28,0,0.28,0.62].forEach(t=>{
      const cy2=icy+t*sr*0.88, cx2=icx-sr*(0.52-Math.abs(t)*0.22);
      ctx.beginPath(); ctx.moveTo(cx2-2,cy2-2.5); ctx.lineTo(cx2+1,cy2+2.5); ctx.stroke();
    });
    [-0.62,-0.28,0,0.28,0.62].forEach(t=>{
      const cy2=icy+t*sr*0.88, cx2=icx+sr*(0.52-Math.abs(t)*0.22);
      ctx.beginPath(); ctx.moveTo(cx2+2,cy2-2.5); ctx.lineTo(cx2-1,cy2+2.5); ctx.stroke();
    });
    ctx.restore();
  } else if(sport.name==='LACROSSE') {
    // Lacrosse stick head outline
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=2; ctx.lineCap='round';
    const lhx=icx, lhy=icy, r2=12;
    ctx.beginPath();
    ctx.moveTo(lhx, lhy-r2);
    ctx.bezierCurveTo(lhx+r2*0.85,lhy-r2*0.9, lhx+r2*0.85,lhy+r2*0.5, lhx,lhy+r2*0.65);
    ctx.bezierCurveTo(lhx-r2*0.85,lhy+r2*0.5, lhx-r2*0.85,lhy-r2*0.9, lhx,lhy-r2);
    ctx.stroke();
    // Mesh cross lines
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1;
    for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(lhx+i*5,lhy-r2*0.8);ctx.lineTo(lhx+i*5,lhy+r2*0.55);ctx.stroke();}
    for(let j=-1;j<=1;j++){const spread=r2*0.7*(1-Math.abs(j)*0.3);ctx.beginPath();ctx.moveTo(lhx-spread,lhy+j*4);ctx.lineTo(lhx+spread,lhy+j*4);ctx.stroke();}
    // Handle
    ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(lhx,lhy+r2*0.65); ctx.lineTo(lhx,lhy+r2*1.3); ctx.stroke();
    ctx.restore();
  } else if(sport.name==='RUGBY') {
    // Rugby ball — brown ellipse with white lace
    ctx.save();
    const rrx=14, rry=8;
    const rg=ctx.createRadialGradient(icx-4,icy-3,2,icx,icy,rrx);
    rg.addColorStop(0,'#a0522d'); rg.addColorStop(1,'#5C2D0A');
    ctx.fillStyle=rg;
    ctx.beginPath(); ctx.ellipse(icx,icy,rrx,rry,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#3a1a00'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.ellipse(icx,icy,rrx,rry,0,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(50,20,0,0.5)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(icx-rrx,icy); ctx.quadraticCurveTo(icx,icy-rry*0.7,icx+rrx,icy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx-rrx,icy); ctx.quadraticCurveTo(icx,icy+rry*0.7,icx+rrx,icy); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.92)'; ctx.lineWidth=1.5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(icx,icy-rry*0.7); ctx.lineTo(icx,icy+rry*0.7); ctx.stroke();
    ctx.lineWidth=1;
    [-4,0,4].forEach(dy=>{ctx.beginPath();ctx.moveTo(icx-4,icy+dy);ctx.lineTo(icx+4,icy+dy);ctx.stroke();});
    ctx.restore();
  } else if(sport.name==='TENNIS') {
    // Tennis ball — yellow-green with white seam curves
    ctx.save();
    const tr=13;
    const tg=ctx.createRadialGradient(icx-4,icy-4,2,icx,icy,tr);
    tg.addColorStop(0,'#e0ee00'); tg.addColorStop(1,'#a8b800');
    ctx.fillStyle=tg;
    ctx.beginPath(); ctx.arc(icx,icy,tr,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#8a9a00'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.arc(icx,icy,tr,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.88)'; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(icx-tr*0.55,icy-tr*0.7); ctx.quadraticCurveTo(icx-tr,icy,icx-tr*0.55,icy+tr*0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx+tr*0.55,icy-tr*0.7); ctx.quadraticCurveTo(icx+tr,icy,icx+tr*0.55,icy+tr*0.7); ctx.stroke();
    ctx.restore();
  } else if(sport.name==='AFL') {
    // Australian flag in the band
    ctx.save();
    const fw=30, fh=16, fx=icx-fw/2, fy=icy-fh/2;
    // Blue Ensign background
    ctx.fillStyle='#00247D'; ctx.fillRect(fx,fy,fw,fh);
    // Union Jack (top-left quarter)
    const ux=fx,uy=fy,uw=fw*0.5,uh=fh*0.5;
    // Diagonal crosses (St Andrew + St Patrick)
    ctx.strokeStyle='#FFFFFF'; ctx.lineWidth=2.5; ctx.lineCap='butt';
    ctx.beginPath(); ctx.moveTo(ux,uy); ctx.lineTo(ux+uw,uy+uh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ux+uw,uy); ctx.lineTo(ux,uy+uh); ctx.stroke();
    ctx.strokeStyle='#CF142B'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(ux,uy); ctx.lineTo(ux+uw,uy+uh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ux+uw,uy); ctx.lineTo(ux,uy+uh); ctx.stroke();
    // St George cross (white then red)
    ctx.fillStyle='#FFFFFF'; ctx.fillRect(ux+uw/2-2,uy,4,uh); ctx.fillRect(ux,uy+uh/2-2,uw,4);
    ctx.fillStyle='#CF142B'; ctx.fillRect(ux+uw/2-1,uy,2,uh); ctx.fillRect(ux,uy+uh/2-1,uw,2);
    // Commonwealth Star (bottom-left)
    function drawStar(sx,sy,r1,r2,pts){
      ctx.beginPath();
      for(let i=0;i<pts*2;i++){const a=i*Math.PI/pts-Math.PI/2;const r=i%2===0?r1:r2;i===0?ctx.moveTo(sx+Math.cos(a)*r,sy+Math.sin(a)*r):ctx.lineTo(sx+Math.cos(a)*r,sy+Math.sin(a)*r);}
      ctx.closePath(); ctx.fillStyle='#FFFFFF'; ctx.fill();
    }
    drawStar(fx+fw*0.19,fy+fh*0.72,3.2,1.3,7);
    // Southern Cross (right side — 4 white 7-pt stars + 1 small)
    [[fw*0.76,fh*0.28],[fw*0.93,fh*0.52],[fw*0.76,fh*0.76],[fw*0.60,fh*0.52]].forEach(([dx,dy])=>drawStar(fx+dx,fy+dy,2.5,1.0,7));
    drawStar(fx+fw*0.85,fh*0.22+fy,1.5,0.6,5);
    ctx.restore();
  } else if(sport.name==='SWIMMING') {
    // Swimming goggles icon in band
    ctx.save();
    const gr=8, gp=3; // goggle lens radius, pupil radius
    ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=2; ctx.lineCap='round';
    // Left lens
    ctx.fillStyle='rgba(100,200,255,0.30)';
    ctx.beginPath(); ctx.arc(icx-gr-1,icy,gr,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(icx-gr-1,icy,gr,0,Math.PI*2); ctx.stroke();
    // Right lens
    ctx.beginPath(); ctx.arc(icx+gr+1,icy,gr,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(icx+gr+1,icy,gr,0,Math.PI*2); ctx.stroke();
    // Bridge between lenses
    ctx.beginPath(); ctx.moveTo(icx-1,icy); ctx.lineTo(icx+1,icy); ctx.stroke();
    // Strap lines going outward
    ctx.strokeStyle='rgba(255,255,255,0.65)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(icx-2*gr-1,icy-gr*0.4); ctx.lineTo(icx-2*gr-10,icy-gr*0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx-2*gr-1,icy+gr*0.4); ctx.lineTo(icx-2*gr-10,icy+gr*0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx+2*gr+1,icy-gr*0.4); ctx.lineTo(icx+2*gr+10,icy-gr*0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx+2*gr+1,icy+gr*0.4); ctx.lineTo(icx+2*gr+10,icy+gr*0.4); ctx.stroke();
    // Inner glare dots
    ctx.fillStyle='rgba(255,255,255,0.60)';
    ctx.beginPath(); ctx.arc(icx-gr-1-gr*0.35,icy-gr*0.35,1.8,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(icx+gr+1-gr*0.35,icy-gr*0.35,1.8,0,Math.PI*2); ctx.fill();
    ctx.restore();
  } else if(sport.name==='WRESTLING/MMA') {
    // Octagon icon in band
    ctx.save();
    const or=12;
    ctx.strokeStyle='rgba(255,255,255,0.90)'; ctx.lineWidth=2;
    ctx.beginPath();
    for(let i=0;i<8;i++){const a=(i*Math.PI/4)-Math.PI/8;i===0?ctx.moveTo(icx+Math.cos(a)*or,icy+Math.sin(a)*or):ctx.lineTo(icx+Math.cos(a)*or,icy+Math.sin(a)*or);}
    ctx.closePath(); ctx.stroke();
    // Inner X
    ctx.strokeStyle='rgba(180,30,10,0.80)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(icx-6,icy-6); ctx.lineTo(icx+6,icy+6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(icx+6,icy-6); ctx.lineTo(icx-6,icy+6); ctx.stroke();
    ctx.restore();
  } else if(sport.name==='EQUESTRIAN') {
    // Horseshoe icon in band
    ctx.save();
    ctx.strokeStyle='rgba(255,220,160,0.92)'; ctx.lineWidth=3; ctx.lineCap='round';
    const hr=11;
    ctx.beginPath(); ctx.arc(icx,icy-2,hr,Math.PI*0.65,Math.PI*2.35,false); ctx.stroke();
    // Nail holes
    ctx.strokeStyle='rgba(255,220,160,0.55)'; ctx.lineWidth=1;
    [Math.PI*0.75,Math.PI*0.95,Math.PI*1.45,Math.PI*1.65].forEach(a=>{
      ctx.beginPath(); ctx.arc(icx+Math.cos(a)*hr,icy-2+Math.sin(a)*hr,1.5,0,Math.PI*2); ctx.stroke();
    });
    ctx.restore();
  } else {
    ctx.font=`28px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='white';
    ctx.fillText(sport.emoji,icx,icy);
  }
  ctx.restore();
}

// Reusable ringette donut ring renderer.
// cx,cy = centre; oR = outer radius; iR = inner radius (hole)
// Uses even-odd fill rule so the hole is genuinely transparent — shows whatever is underneath.
function drawRingetteRing(ctx, cx, cy, oR, iR) {
  ctx.save();
  // Radial gradient for 3-D rubber look (light top-left → deep bottom-right)
  const rg=ctx.createRadialGradient(cx-oR*0.35, cy-oR*0.35, 1, cx, cy, oR*1.05);
  rg.addColorStop(0,   '#7ecbf0');
  rg.addColorStop(0.38,'#3a9ad4');
  rg.addColorStop(0.76,'#2176ae');
  rg.addColorStop(1,   '#155e8a');
  ctx.fillStyle=rg;
  // Compound path: outer circle (CW) + inner circle (CCW) → even-odd gives clean hole
  ctx.beginPath();
  ctx.arc(cx, cy, oR, 0, Math.PI*2, false);   // outer — clockwise
  ctx.arc(cx, cy, iR, 0, Math.PI*2, true);    // inner — counter-clockwise (creates hole)
  ctx.fill('evenodd');
  // Subtle tread groove arcs around the ring body
  ctx.globalAlpha=0.28;
  ctx.strokeStyle='#0d3d5e';
  ctx.lineWidth=1.0;
  const rm=(oR+iR)/2;
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5;
    ctx.beginPath(); ctx.arc(cx,cy,rm,a,a+0.20); ctx.stroke();
  }
  ctx.globalAlpha=1;
  // Gloss sheen arc at top-left
  ctx.strokeStyle='rgba(255,255,255,0.60)';
  ctx.lineWidth=oR>12 ? 2.2 : 1.4;
  ctx.lineCap='round';
  ctx.beginPath(); ctx.arc(cx,cy,oR*0.76,Math.PI*1.08,Math.PI*1.62); ctx.stroke();
  ctx.restore();
}

function drawSportDetails(ctx,showDetails,rx,tw,ry,th,rcx,startY,raffleType,sport,shapeInfo,textCol,accentColor,cyo,mro){
  if(!showDetails) return;

  // ── Shape geometry ─────────────────────────────────────────────────────────
  const cy   = shapeInfo ? shapeInfo.cy : ry+th/2;
  const R    = shapeInfo ? shapeInfo.R  : Math.min(tw,th)*0.40;
  const pad  = R * 0.14;
  const top  = cy - R + pad;
  const bot  = cy + R - pad;
  const safeChord = R * 1.40;
  const avail = bot - top;

  // ── Build structured display lines (same as standard) ──────────────────────
  const displayLines = buildDetailDisplayLines(readFormState());
  if (displayLines.length === 0) return;

  // ── Text colour — shape interior is white, need dark text ──────────────────
  let detailColor = '#1a1a1a';
  if(accentColor){
    const [ar,ag,ab]=accentColor;
    const lum=(0.299*ar+0.587*ag+0.114*ab)/255;
    detailColor = lum<=0.55 ? `rgb(${ar},${ag},${ab})` : '#1a1a1a';
  }

  const fontOf = (fs, bold) => bold
    ? `bold ${fs}px "DM Sans","Helvetica Neue",sans-serif`
    : `${fs}px "DM Sans","Helvetica Neue",sans-serif`;

  // ── Intelligent line builder: ALL pkgs on one line or ALL individual ─────────
  function buildWrappedLines(fs) {
    const lineH = Math.round(fs * 1.32);
    const titleH = Math.round(fs * 1.60);
    let lines = [];

    // Decide package layout: ALL on one line or ALL individual
    const pkgItems = displayLines.filter(d => d.type === 'pkg');
    let pkgOneLine = false;
    if (pkgItems.length > 0) {
      ctx.font = fontOf(fs, false);
      const joined = pkgItems.map(p => p.text).join('     ');
      pkgOneLine = ctx.measureText(joined).width <= safeChord;
    }

    for (const item of displayLines) {
      ctx.font = fontOf(fs, item.bold);

      if (item.type === 'pkg') {
        if (pkgOneLine) {
          // Emit combined line once (on first pkg item)
          if (item === pkgItems[0]) {
            const joined = pkgItems.map(p => p.text).join('     ');
            lines.push({ text: joined, bold: false, type: 'pkg' });
          }
        } else {
          // All individual
          lines.push({ text: item.text, bold: item.bold, type: item.type });
        }
      } else if (item.nowrap) {
        // MUST stay on single line — never word-wrap
        lines.push({ text: item.text, bold: item.bold, type: item.type, nowrap: true });
      } else {
        // Standard word wrapping
        const words = item.text.split(' ');
        let line = '';
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (ctx.measureText(test).width > safeChord && line) {
            lines.push({ text: line, bold: item.bold, type: item.type });
            line = w;
          } else line = test;
        }
        if (line) lines.push({ text: line, bold: item.bold, type: item.type });
      }
    }
    let total = 0;
    lines.forEach(ln => { total += ln.type === 'title' ? titleH : lineH; });
    // Check all nowrap lines fit horizontally within the shape chord
    const nowrapFits = lines.every(ln => {
      if (!ln.nowrap) return true;
      ctx.font = fontOf(fs, ln.bold);
      return ctx.measureText(ln.text).width <= safeChord;
    });
    return { lines, totalH: total, lineH, titleH, nowrapFits };
  }

  // ── Find best font size — conservative cap for polished look ───────────────
  // Cap: never exceed R*0.18 (prevents oversized text with sparse content)
  // Also cap per number of content lines so many lines don't get microscopic
  const rawLineCount = displayLines.length;
  const maxFS = Math.min(
    Math.round(R * 0.18),                     // shape-proportional cap
    Math.round(avail / rawLineCount * 0.65),   // per-line cap
    Math.round(safeChord * 0.08)               // width-proportional cap
  );
  let lo = 7, hi = Math.max(lo, maxFS);
  let bestFS = lo, bestMeasure = buildWrappedLines(lo);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const m = buildWrappedLines(mid);
    if (m.totalH <= avail * 0.88 && m.nowrapFits) { bestFS = mid; bestMeasure = m; lo = mid + 1; }
    else hi = mid - 1;
  }
  const { lines, totalH, lineH, titleH } = bestMeasure;

  // ── Vertical centering within shape ────────────────────────────────────────
  const blockStartY = cy - totalH / 2 + bestFS;

  // ── Draw ───────────────────────────────────────────────────────────────────
  ctx.save();
  if (shapeInfo) { sportShapePath(ctx, rx, ry, tw, th, currentSport, cyo, mro); ctx.clip(); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let drawY = blockStartY;
  for (const ln of lines) {
    if (drawY > bot) break;
    ctx.font = fontOf(bestFS, ln.bold);
    ctx.fillStyle = detailColor;
    ctx.shadowColor = 'rgba(0,0,0,0.20)';
    ctx.shadowBlur = 2; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
    ctx.fillText(ln.text, rcx, drawY);
    const step = ln.type === 'title' ? titleH : lineH;
    drawY += step;
  }
  ctx.restore();
}



async function finaliseDownload(){
  const state = readFormState();
  const src = dom('preview');
  const ctx = src.getContext('2d');
  const qrUrl = state.qrUrl;

  // Draw QR code(s) — letter gets two corner QRs in the bottom ticket;
  // all other formats get one QR in the bottom-right corner as before.
  // Wrapped so a QR render failure (timeout, invalid URL) logs to console
  // but still lets the download complete without the QR overlay.
  if (qrUrl && _ticketLayout) {
    try {
      const {rx, ry, tw, th} = _ticketLayout;
      if (currentRatio === 'letter' && currentMode !== 'simple') {
        // Two QRs in the lower corners of the bottom (raffle) ticket.
        // Size is chosen so the QR top sits safely below the prize image bottom
        // and the pill stays fully within the ticket shape.
        const qrSize  = Math.round(Math.min(tw, th) * 0.175); // ~228 px at letter scale
        const pad     = Math.round(qrSize * 0.15);
        const labelFS = Math.max(8, Math.round(qrSize * 0.13));
        const inset   = 16; // gap from ticket edge for both axes

        // Anchor pill bottom to ticket bottom minus inset and sport band
        const _letterBandOff = _ticketLayout.bandH || 0;
        const qrY = ry + th - inset - qrSize - pad - labelFS - 6 - _letterBandOff;

        // Lower-right corner of the bottom ticket
        const rqrX = rx + tw - inset - qrSize - pad;
        await drawQROnCanvas(ctx, rqrX, qrY, qrSize, qrUrl);

        // Lower-left corner of the bottom ticket
        const lqrX = rx + inset + pad;
        await drawQROnCanvas(ctx, lqrX, qrY, qrSize, qrUrl);

      } else {
        let qrSize = Math.round(Math.min(tw, th) * 0.14);
        let pad    = Math.round(qrSize * 0.15);
        let labelFS = Math.max(8, Math.round(qrSize * 0.13));
        let pillH  = qrSize + pad * 2 + labelFS + 8;
        // Offset QR above sport banner text band (bandH=0 for standard)
        const _bandOff = _ticketLayout.bandH || 0;
        let qrX = rx + tw - qrSize - pad - 10;
        let qrY = ry + th - pillH - 10 - _bandOff;

        // Sport mode: nudge the QR outward along the diagonal from the shape
        // centre so its shape-facing (top-left) corner sits outside the shape
        // circle. If even at 60% size it can't clear the shape without
        // leaving the ticket, we keep the shrunken version and accept a
        // small overlap rather than push it off-canvas.
        const rShape = currentMode === 'sport' ? _ticketLayout.rShape : null;
        if (rShape) {
          const safeGap = 10;
          for (let attempt = 0; attempt < 3; attempt++) {
            const pillW = qrSize + pad * 2;
            const shapeCornerDist = Math.hypot(qrX - rShape.cx, qrY - rShape.cy);
            const need = rShape.R + safeGap;
            if (shapeCornerDist >= need) break;
            // Push top-left corner outward along the diagonal from shape centre.
            const dx = qrX - rShape.cx, dy = qrY - rShape.cy;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const shiftX = (dx / dist) * (need - dist);
            const shiftY = (dy / dist) * (need - dist);
            const trialX = qrX + shiftX;
            const trialY = qrY + shiftY;
            // If shifting still leaves the pill inside the ticket, accept it.
            const fitsTicket = (trialX + pillW <= rx + tw - 4) &&
                               (trialY + pillH <= ry + th - _bandOff - 4);
            if (fitsTicket) {
              qrX = trialX; qrY = trialY;
              break;
            }
            // Doesn't fit — shrink the QR and retry.
            qrSize   = Math.round(qrSize * 0.85);
            pad      = Math.round(qrSize * 0.15);
            labelFS  = Math.max(8, Math.round(qrSize * 0.13));
            pillH    = qrSize + pad * 2 + labelFS + 8;
            qrX = rx + tw - qrSize - pad - 10;
            qrY = ry + th - pillH - 10 - _bandOff;
          }
        }

        await drawQROnCanvas(ctx, qrX, qrY, qrSize, qrUrl);
      }
    } catch (err) {
      console.warn('QR render failed, continuing without QR overlay:', err);
    }
  }

  // SC logo removed per client request — banners are clean / unbranded

  // Use the preview canvas directly (no duplicate watermark canvas). We now
  // route through toBlob → inject iTXt state chunk → Object URL so the
  // downloaded PNG carries a re-uploadable snapshot of every form field
  // plus the uploaded logo/prize image bytes.
  const dl = dom('downloadLink');
  const ratioStr = currentRatio === 'letter'  ? 'letter-8x11-300dpi'
                 : currentRatio === 'custom'  ? `${RATIOS.custom?.W||0}x${RATIOS.custom?.H||0}`
                 : currentRatio.replace(':','-').replace('.','p');
  const orgSlug = (state.orgName || 'raffle')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,28) || 'raffle';
  const sportSlug = currentMode === 'sport' ? `-${currentSport}` : '';
  dl.download = `${orgSlug}${sportSlug}-${ratioStr}.png`;

  // Show preview canvas
  src.classList.add('visible');
  dom('previewPlaceholder').style.display = 'none';

  // Show download section
  dom('downloadSection').classList.add('visible');

  // Update dimensions display
  const dims = dom('previewDims');
  if (dims) dims.textContent = `${src.width} × ${src.height}`;

  // Build the PNG blob, embed state, then set the download href to a blob
  // URL. Fall back to the plain data URL if anything goes wrong so a broken
  // encoder never prevents the user from getting their banner.
  const pngBlob = await new Promise((resolve) => src.toBlob(resolve, 'image/png'));
  let finalBlob = pngBlob;
  const ratioLabel = currentRatio === 'letter' ? 'Letter · 8.5×11 in · 300 DPI' : currentRatio;
  if (pngBlob) {
    try {
      const snapshot = await captureBannerState();
      finalBlob = await injectStateIntoPng(pngBlob, snapshot);
    } catch(e) {
      console.warn('State embed failed, downloading plain PNG:', e);
      finalBlob = pngBlob;
    }
    if (_lastDownloadUrl) URL.revokeObjectURL(_lastDownloadUrl);
    _lastDownloadUrl = URL.createObjectURL(finalBlob);
    dl.href = _lastDownloadUrl;
    const kb = (finalBlob.size / 1024).toFixed(0);
    setStatus('ready', UI_STRINGS[currentLang].statusBannerReady(ratioLabel, kb));
  } else {
    // toBlob unsupported / failed — fall back to the original data URL path.
    dl.href = src.toDataURL('image/png');
    setStatus('ready', UI_STRINGS[currentLang].statusBannerReadyNoKb(ratioLabel));
  }
}





// ── Window bridges for HTML inline handlers ────────────────────────────────
// ES modules give each top-level declaration module scope, not global scope.
// The markup still uses inline onclick/oninput/onchange attributes that
// resolve names against window, so every function referenced from HTML has
// to be re-exposed here. Keep this list in sync with attributes in index.html.
Object.assign(window, {
  // onclick=
  addPackage, commitCustomRatio, copyToClipboard, generatePoster,
  openInstructions, removePackage, removeQrUrl, removeUploadedFile,
  resetBrandPalette, selectCustomRatio, selectRatio, selectSport,
  setMode, toggleAdditional,
  setLanguage, setPromoType, resetAll, updateCustomCounter,
  // oninput=
  formatCommaNumber, setBrandSwatchColor, updateCustomColors, updateCustomPreview, updateQrPreview,
  // onchange=
  togglePrizeImage, updateFileLabel, restoreFromPng,
  // referenced from other JS (used to be implicit globals)
  scheduleAutoPreview,
});
