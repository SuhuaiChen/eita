import { test, expect, type Page } from "@playwright/test";

// A minimal valid LearnerState — load() merges it over the empty default, so
// only the fields that matter need to be present.
const SEED_STATE = {
  profile: {
    name: "Ana",
    level: "some",
    interests: ["comida", "familia", "viagens"],
    moments: [
      { id: "cafe", time: "08:00", enabled: true },
      { id: "almoco", time: "12:30", enabled: true },
      { id: "tarde", time: "17:30", enabled: true },
      { id: "noite", time: "20:30", enabled: true },
    ],
    selfConfidence: "medium",
    createdAt: Date.now(),
  },
  concepts: {},
  confidencePressure: 0,
  interactions: [],
  recentTargets: [],
  recentDialogues: [],
  dailyDone: {},
  lastSeenVersion: 1,
};

async function seedProfile(page: Page) {
  await page.addInitScript((s) => {
    localStorage.setItem("eita:state:v1", JSON.stringify(s));
    localStorage.setItem("eita:agendaPitchSeen", "1"); // keep the board clean
  }, SEED_STATE);
}

/** tap through the current dialogue until the recap buttons appear */
async function runDialogue(page: Page) {
  // up to 6 learner turns; each advances after a tap. Reply buttons carry a
  // .py-big pinyin span (choice) or a bare pt label (check) — word chips have
  // neither, which keeps this selector off the inline glosses.
  const replySel = page
    .locator("button:has(.py-big), .border-t.border-line .grid > button")
    .first();
  for (let i = 0; i < 6; i++) {
    const done = page.getByRole("button", { name: "Por hoje é só" });
    if (await done.isVisible()) return;
    if (await replySel.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await replySel.click();
    }
    await page.waitForTimeout(900);
    if (await done.isVisible()) return;
  }
  await expect(page.getByRole("button", { name: "Por hoje é só" })).toBeVisible({ timeout: 15_000 });
}

test("onboarding completes and lands on /hoje", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByPlaceholder("Seu nome").fill("Ana");
  await page.getByRole("button", { name: "Começar" }).click();
  await page.getByRole("button", { name: /Já sei um pouco/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  for (const t of ["Comida", "Família", "Viagens"])
    await page.getByRole("button", { name: new RegExp(t) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click(); // moments default
  await page.getByRole("button", { name: /Depende da situação/ }).click();
  await page.getByRole("button", { name: "Tudo certo!" }).click();
  await expect(page).toHaveURL(/\/hoje/);
  await expect(page.getByRole("heading", { name: /Ana/ })).toBeVisible();
});

test("hoje → pratica → completes a dialogue → back to hoje", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/hoje");
  await page.getByRole("button", { name: /Conversar/ }).first().click();
  await expect(page).toHaveURL(/\/pratica/);
  // first eita bubble appears, then reply options
  await expect(page.getByText("Sua resposta:").or(page.locator("text=Sua resposta"))).toBeVisible({ timeout: 10_000 });
  await runDialogue(page);
  await page.getByRole("button", { name: "Por hoje é só" }).click();
  await expect(page).toHaveURL(/\/hoje/);
});

test("progresso renders the new sections", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/progresso");
  await expect(page.getByRole("heading", { name: /O que você já conquistou/ })).toBeVisible();
  await expect(page.getByText(/Esta semana:/)).toBeVisible();
  await expect(page.getByText(/Banco de vocabulário/i)).toBeVisible();
});

test("perfil shows the calendar section (demo mode)", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/perfil");
  await expect(page.getByText("Sua agenda")).toBeVisible();
  await expect(page.getByText(/Google Agenda/)).toBeVisible();
  await expect(page.getByText("Aparência")).toBeVisible();
});

test("leaving /pratica mid-dialogue resumes where it stopped", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/hoje");
  await page.getByRole("button", { name: /Conversar/ }).first().click();
  await expect(page).toHaveURL(/\/pratica/);
  // let the first eita line land and reply options render
  await page.waitForTimeout(1500);
  const bubbles = await page.locator('[lang="zh-CN"]').count();
  expect(bubbles).toBeGreaterThan(0);
  await page.reload();
  // same thread restored — at least as many bubbles as before
  await page.waitForTimeout(1500);
  const after = await page.locator('[lang="zh-CN"]').count();
  expect(after).toBeGreaterThanOrEqual(bubbles);
});
