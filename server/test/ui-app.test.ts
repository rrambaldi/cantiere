// L'App intera in jsdom, con fetch finto: la scelta nell'indirizzo, un link, Indietro e Avanti, risposte in ritardo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { montaApp } from "./app-finta.ts";

const ORA = "2026-10-22T08:00:00Z";
const sciolta = (session_id: string, domande: object[]) =>
  ({ session_id, titolo: null, host: "mine", avviata_il: ORA, ultimo_evento_il: ORA, turni: 1, stato: "in_attesa", ultimo_stato: null, domande });

// Si apre da un link al figlio mentre il browser ricorda un'altra scelta, la cui risposta arriva per ultima.
const { window, $, clic, naviga, titolo, hash } = await montaApp({
  url: "http://x/cantiere/#/PRIV/cantiere/navigazione-dashboard/figlio",
  ricordati: { "forgia-selezione": { tipo: "cantiere", id: 100 } },
  ritardi: { "cantieri/100": 200 },
  nonCensite: [sciolta("s1", [{ id: "d", session_id: "s1", tipo: "scelta", testo: "Procedo con il push?", opzioni: ["sì", "no"], host: "mine", ts: ORA, eta_secondi: 60 }]), sciolta("s2", [])],
});

test("un link apre quella scelta anche se il browser ne ricorda un'altra, e una risposta in ritardo non la copre", () => {
  assert.equal(titolo(), "navigazione-dashboard/figlio");
  assert.equal(hash(), "#/PRIV/cantiere/navigazione-dashboard/figlio");
});

test("tre scelte aggiungono tre passi; tre Indietro le ripercorrono, Avanti torna avanti", async () => {
  const inizio = window.history.length;
  await clic("button.indietro");
  await clic(".voce", "mercurius");
  await clic('.filtri-livello [role="tab"]', "Aperti");
  await clic(".voce", "AI-Berkshire");
  await clic(".percorso button", "PRIV");
  assert.equal(window.history.length, inizio + 3);
  assert.equal(hash(), "#/PRIV");
  await naviga(() => window.history.back());
  assert.deepEqual([titolo(), hash()], ["AI-Berkshire", "#/PRIV/mercurius/AI-Berkshire"]);
  await naviga(() => window.history.back());
  assert.deepEqual([titolo(), hash()], ["mercurius", "#/PRIV/mercurius"]);
  await naviga(() => window.history.back());
  assert.deepEqual([titolo(), hash()], ["navigazione-dashboard/figlio", "#/PRIV/cantiere/navigazione-dashboard/figlio"]);
  await naviga(() => window.history.forward());
  assert.deepEqual([titolo(), hash()], ["mercurius", "#/PRIV/mercurius"]);
});

test("un indirizzo che non porta a niente torna quello della scelta", async () => {
  await naviga(() => (window.location.hash = "#/PRIV/nulla"));
  assert.deepEqual([titolo(), hash()], ["mercurius", "#/PRIV/mercurius"]);
});

test("lo stesso indirizzo scritto in un'altra codifica non aggiunge passi", async () => {
  await naviga(() => (window.location.hash = "#/PRIV/cantiere"));
  const prima = window.history.length;
  await naviga(() => (window.location.hash = "#/PRIV/%6Dercurius"));
  assert.equal(window.history.length, prima + 1, "solo il passo del browser");
  assert.deepEqual([titolo(), window.location.hash], ["mercurius", "#/PRIV/mercurius"]);
});

test("al desktop Esc non chiude la scheda", async () => {
  assert.ok($(".scheda"));
  await naviga(() => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" })));
  assert.ok($(".scheda"));
});

test("nella pagina del progetto la domanda di una sessione senza cantiere sta in cima, e la sua riga ha il pallino", async () => {
  await naviga(() => (window.location.hash = "#/PRIV/cantiere"));
  assert.equal(titolo(), "cantiere");
  assert.equal($(".domande-attesa .testo-domanda")?.textContent, "Procedo con il push?");
  const righe = [...window.document.querySelectorAll(".tabella tbody tr")].map((r) => r.querySelector(".pallino") !== null);
  assert.deepEqual(righe, [true, false]);
});

test("nel committente la scheda scelta, Progetti o Binari, resta anche tornandoci da un'altra pagina", async () => {
  await naviga(() => (window.location.hash = "#/PRIV"));
  assert.equal($('[role="tab"][aria-selected="true"]')?.textContent, "Progetti2");
  await clic('[role="tab"]', "Binari");
  assert.equal(window.localStorage.getItem("forgia-scheda-committente"), '"binari"');
  await naviga(() => (window.location.hash = "#/PRIV/cantiere"));
  await naviga(() => (window.location.hash = "#/PRIV"));
  assert.equal($('[role="tab"][aria-selected="true"]')?.textContent, "Binari");
  assert.ok($(".binari"));
});

test("la lingua si sceglie da una tendina con i nomi delle lingue", async () => {
  const scelta = $(".lingua select") as HTMLSelectElement;
  assert.deepEqual([...scelta.options].map((o) => o.textContent), ["Italiano", "English"]);
  await naviga(() => { scelta.value = "en"; scelta.dispatchEvent(new window.Event("change", { bubbles: true })); });
  assert.equal(window.document.documentElement.lang, "en");
  assert.equal(window.localStorage.getItem("forgia-lingua"), "en");
});
