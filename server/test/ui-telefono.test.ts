// L'App al telefono: si parte dal centro; la scheda è un foglio sopra la pagina resa inerte, che si chiude con la X, il velo
// o Esc; stringendo o allargando la finestra si passa dallo stato del telefono a quello ricordato per il desktop.
import assert from "node:assert/strict";
import { test } from "node:test";
import { montaApp } from "./app-finta.ts";

const RICORDATE = { colonna: true, scheda: true };
const { window, $, clic, naviga, titolo, cambiaLarghezza } = await montaApp({
  url: "http://x/cantiere/#/PRIV/mercurius/AI-Berkshire", telefono: true, ricordati: { "forgia-colonne": RICORDATE },
});
const APRI = '.barra-testata [title="Apri la scheda tecnica"]';
const apri = () => clic(APRI);
const esc = () => naviga(() => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })));
const inerte = () => $(".dashboard")!.hasAttribute("inert");

test("si parte dal centro: colonna e scheda chiuse anche se il browser le ricorda aperte", () => {
  assert.equal(titolo(), "AI-Berkshire");
  assert.ok($(".rotaia"));
  assert.equal($(".scheda"), null);
});

test("il foglio rende inerte la pagina, prende il fuoco e chiudendosi lo restituisce", async () => {
  const bottone = $(APRI)!;
  bottone.focus();
  await apri();
  assert.ok($(".foglio .scheda") && $(".velo") && inerte());
  assert.ok(window.document.activeElement?.closest(".chiudi-foglio"), "il fuoco è sulla X del foglio");
  await clic('.chiudi-foglio [title="Chiudi la scheda tecnica"]');
  assert.ok(!$(".foglio") && !inerte());
  assert.ok(window.document.activeElement === bottone, "il fuoco torna al bottone della testata");
});

test("il foglio si chiude anche con il velo e con Esc", async () => {
  await apri();
  await clic(".velo");
  assert.equal($(".foglio"), null);
  await apri();
  await esc();
  assert.equal($(".foglio"), null);
});

test("un dialogo aperto dal foglio sta fuori dalla pagina inerte, ed Esc non chiude il foglio sotto", async () => {
  await apri();
  await clic(".foglio button", "Nuova idea");
  assert.ok($('[role="dialog"] input') && !$('.dashboard [role="dialog"]'));
  await esc(); // il dialogo della nuova idea si chiude solo con i suoi bottoni
  assert.ok($('[role="dialog"] input') && $(".foglio"));
  await clic('[role="dialog"] button', "Annulla");
  assert.equal($('[role="dialog"] input'), null);
  await esc();
  assert.equal($(".foglio"), null);
});

test("quel che si apre al telefono non si ricorda, e allargando torna lo stato del desktop", async () => {
  await clic(".sfoglia");
  await apri();
  assert.deepEqual(JSON.parse(window.localStorage.getItem("forgia-colonne")!), RICORDATE);
  await cambiaLarghezza(false);
  assert.ok($(".dashboard > .scheda") && !$(".foglio") && !inerte() && $(".livello"));
  await cambiaLarghezza(true);
  assert.ok(!$(".scheda") && $(".rotaia"), "rientrando al telefono si riparte chiuse");
});

test("chiuso il foglio il fuoco torna al bottone della testata, anche se intanto la pagina è cambiata", async () => {
  await apri();
  await naviga(() => (window.location.hash = "#/PRIV/cantiere"));
  assert.equal(titolo(), "cantiere");
  await clic('.chiudi-foglio [title="Chiudi la scheda tecnica"]');
  assert.ok(window.document.activeElement === $(APRI), "il fuoco è sul bottone della pagina nuova");
});

test("allargando la finestra con un dialogo aperto dal foglio, il fuoco resta nel dialogo", async () => {
  await apri();
  await clic(".foglio button", "Nuova idea");
  const campo = $('[role="dialog"] input')!;
  assert.ok(window.document.activeElement === campo);
  await cambiaLarghezza(false);
  assert.ok(window.document.activeElement === campo, "il fuoco è ancora nel campo");
  await clic('[role="dialog"] button', "Annulla");
  await cambiaLarghezza(true);
});
