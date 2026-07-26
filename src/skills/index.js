import { tutorialSkill } from './tutorial/skill';
import { compositeTutorialSkill } from './composite-tutorial/skill';
import { columnTopicSkill } from './column-topic/skill';
import { uiDebugSkill } from './ui-debug/skill';
import { uxResearchSkill } from './ux-research/skill';
import { videoWorkflowSkills } from './video-workflows/skills';

export const SKILL_REGISTRY = [tutorialSkill, ...videoWorkflowSkills, compositeTutorialSkill, columnTopicSkill, uiDebugSkill, uxResearchSkill];

export const DEFAULT_SKILL_ID = 'tutorial';

export function getSkillById(skillId) {
    return SKILL_REGISTRY.find(skill => skill.id === skillId) || SKILL_REGISTRY[0];
}
