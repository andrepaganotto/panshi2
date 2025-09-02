import repository from "../repositories/automationsRepository.js";
import bot, { automations } from "../apps/bot.js";

async function createAutomation(req, res) {
    const data = req.body;

    const automation = await repository.createAutomation(data);

    if (!automation) return res.status(500).json({ message: 'Failed to create automation, try again later' });

    res.status(201).json(automation);

    bot.startAutomation(automation);
}

async function getAutomation(req, res) {
    const id = req.params.id;

    if (!automations[id]) return res.status(404).json({ message: 'Automation not found' });

    return res.json(automations[id]);
}

async function getAutomations(req, res) {
    return res.json(Object.values(automations));
}

async function updateAutomation(req, res) {
    const id = req.params.id;
    const data = req.body;

    if (!automations[id]) return res.status(404).json({ message: 'Automation not found' });

    const automation = await repository.createAutomation(data);

    bot.editAutomation(id, automation);

    return res.status(200).end();
}

async function stopAutomation(req, res) {
    const id = req.params.id;

    const automation = bot.stopAutomation(id);

    if (!automation) return res.status(404).json({ messsage: 'Automation not found' });

    return res.status(200).end();
}

//Database operations
async function getAutomationsDB(req, res) {
    const automations = await repository.getAutomations();

    if (!automations) return res.status(500).json({ message: 'Unable to fetch automation' });

    return res.json(automations);
}

async function deleteAutomationDB(req, res) {
    const id = req.params.id;

    const deleted = await repository.deleteAutomation(id);

    if (!deleted) return res.status(500).json({ message: 'Unable to delete automation' });

    return res.status(200).end();
}

export default { createAutomation, getAutomation, getAutomations, updateAutomation, stopAutomation, getAutomationsDB, deleteAutomationDB };