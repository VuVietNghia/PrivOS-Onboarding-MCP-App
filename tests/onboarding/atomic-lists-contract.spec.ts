import { assertAtomicListsContract } from '../helpers/atomic-lists-contract';
import { makeAtomicListsHarness } from '../helpers/atomic-lists-fake';

assertAtomicListsContract(makeAtomicListsHarness);
