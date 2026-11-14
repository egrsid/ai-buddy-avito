import { expect,it } from 'vitest';
import { WorkspaceModel,ProposalModel,TimelineModel,ImpactModel } from './models';
import { workspaces,proposal,timeline,impact } from './samples';
it('presentation models reject extra fields and unsafe action URLs',()=>{
 expect(WorkspaceModel.safeParse({...workspaces[0],internId:'foreign'}).success).toBe(false);
 expect(WorkspaceModel.safeParse({...workspaces[0],nextAction:{label:'Unsafe',href:'javascript:alert(1)'}}).success).toBe(false);
 expect(ProposalModel.safeParse({...proposal,changes:[proposal.changes[0],proposal.changes[0]]}).success).toBe(false);
 expect(TimelineModel.safeParse({...timeline,entries:[timeline.entries[0],timeline.entries[0]]}).success).toBe(false);
});
it('suppression and missing data cannot carry a hidden difference',()=>{
 const hidden={version:1,eligible:null,affected:null,rate:null,suppressed:true};
 expect(ImpactModel.safeParse({...impact,before:hidden}).success).toBe(false);
 expect(ImpactModel.safeParse({...impact,before:hidden,deltaPp:null}).success).toBe(true);
 expect(ImpactModel.safeParse({...impact,before:{...hidden,affected:1}}).success).toBe(false);
 expect(ImpactModel.safeParse({...impact,before:{...impact.before!,affected:11}}).success).toBe(false);
 expect(ImpactModel.safeParse({...impact,status:'collecting',before:null,after:null,deltaPp:null}).success).toBe(true);
});
